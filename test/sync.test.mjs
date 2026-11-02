import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { listPresets } from "../lib/layers.mjs";
import { run, stubSkillsCli, tempDir } from "./helpers.mjs";

let project;
beforeEach(() => {
	project = tempDir();
});
afterEach(() => rmSync(project, { recursive: true, force: true }));

const read = (rel) => readFileSync(path.join(project, rel), "utf8");
const write = (rel, text) => {
	mkdirSync(path.dirname(path.join(project, rel)), { recursive: true });
	writeFileSync(path.join(project, rel), text);
};
const lock = () => JSON.parse(read(".ai-flow.lock.json"));

/** Every file under `dir`, relative, with `/` separators. */
function files(dir, prefix = "") {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isSymbolicLink()) return [rel];
		return entry.isDirectory() ? files(path.join(dir, entry.name), rel) : [rel];
	});
}

const presets = listPresets().filter((preset) => !preset.mixin);

describe("init", () => {
	for (const { name } of presets) {
		it(`syncs a full, valid project for ${name}`, () => {
			write("package.json", '{"name":"demo","version":"1.4.0"}\n');
			const result = run(project, "init", "--preset", name);
			assert.equal(result.status, 0, result.stderr);
			for (const rel of [
				"ai/agents/planner.md",
				".claude/agents/planner.md",
				".claude/skills/ship-issue/SKILL.md",
				".github/workflows/back-merge.yml",
				"docs/decisions/_template.md",
				"FEATURES.md",
				"docs/backlog-priority-report.md",
				"scripts/ai/adr-index.sh",
				"CLAUDE.md",
				".ai-flow.lock.json",
			]) {
				assert.ok(existsSync(path.join(project, rel)), `${name}: missing ${rel}`);
			}
			// Windows without symlink rights gets a copy instead.
			if (lstatSync(path.join(project, "AGENTS.md")).isSymbolicLink()) {
				assert.equal(readlinkSync(path.join(project, "AGENTS.md")), "CLAUDE.md");
			} else {
				assert.equal(read("AGENTS.md"), read("CLAUDE.md"));
			}
			for (const rel of files(project)) {
				if (rel === "AGENTS.md" || rel === "GEMINI.md") continue;
				const text = read(rel);
				assert.doesNotMatch(text, /@@[A-Za-z0-9_.-]+@@/, `${name}: placeholder left in ${rel}`);
				if (rel.endsWith(".json")) assert.doesNotThrow(() => JSON.parse(text), `${name}: invalid JSON in ${rel}`);
			}
			// Release-please starts from the project's own version and name.
			assert.deepEqual(JSON.parse(read(".release-please-manifest.json")), { ".": "1.4.0" });
			assert.equal(JSON.parse(read("release-please-config.json")).packages["."]["package-name"], "demo");
			// Skills are not copied; until they are installed the lock is
			// incomplete, so `check` reports that drift.
			assert.match(run(project, "check").stdout, /skills not in skills-lock\.json/);
			assert.equal(run(project, "skills", "install", { env: stubSkillsCli() }).status, 0);
			const check = run(project, "check");
			assert.equal(check.status, 0, `${name}: ${check.stdout}`);
		});
	}

	it("refuses a mixin, an existing config without --force, and an unknown preset", () => {
		assert.match(run(project, "init", "--preset", "firebase").stderr, /is a mixin/);
		assert.match(run(project, "init", "--preset", "cobol").stderr, /Unknown preset "cobol"/);
		assert.equal(run(project, "init", "--preset", "node-ts").status, 0);
		assert.match(run(project, "init", "--preset", "node-ts").stderr, /already exists/);
	});

	it("--force switches the preset and removes what the old one managed", () => {
		run(project, "init", "--preset", "typescript-vite-firebase");
		assert.ok(existsSync(path.join(project, "ai/agents/rules-auditor.md")));
		const result = run(project, "init", "--preset", "node-ts", "--force");
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /removed: ai\/agents\/rules-auditor\.md/);
		assert.ok(!existsSync(path.join(project, "ai/agents/rules-auditor.md")));
		assert.ok(!existsSync(path.join(project, ".claude/agents/ui-auditor.md")));
		assert.equal(JSON.parse(read(".ai-flow.json")).preset, "node-ts");
	});

	it("--force replaces a config that is broken or names an unknown preset", () => {
		write(".ai-flow.json", '{"preset": "gone", "vars": {"language": {"collab": "Portuguese"}}}');
		let result = run(project, "init", "--preset", "node-ts", "--force");
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(JSON.parse(read(".ai-flow.json")).vars, { language: { collab: "Portuguese" } });

		write(".ai-flow.json", "{ not json");
		result = run(project, "init", "--preset", "node-ts", "--force");
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stderr, /invalid JSON.*writing a new \.ai-flow\.json/);
		assert.equal(JSON.parse(read(".ai-flow.json")).preset, "node-ts");
	});
});

describe("presets", () => {
	it("adds the firebase roles and rules workflow only with a firebase preset", () => {
		run(project, "init", "--preset", "node-ts");
		assert.ok(!existsSync(path.join(project, "ai/agents/rules-auditor.md")));
		assert.ok(!existsSync(path.join(project, ".github/workflows/rules-test.yml")));

		const other = tempDir();
		run(other, "init", "--preset", "typescript-vite-firebase");
		assert.ok(existsSync(path.join(other, ".claude/agents/rules-auditor.md")));
		assert.ok(existsSync(path.join(other, ".github/workflows/rules-test.yml")));
		assert.match(readFileSync(path.join(other, "ai/agents/planner.md"), "utf8"), /public mirrors/);
		rmSync(other, { recursive: true, force: true });
	});

	it("runs only scripts each preset requires in build-check", () => {
		const build = (preset) => {
			const dir = tempDir();
			try {
				run(dir, "init", "--preset", preset);
				return readFileSync(path.join(dir, ".github/workflows/build-check.yml"), "utf8");
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		};
		// node-base requires no build script, so it type-checks instead.
		assert.match(build("node-base"), /run: npx tsc --noEmit/);
		assert.match(build("react-native-firebase"), /run: npx tsc --noEmit/);
		assert.match(build("node-ts"), /run: npm run build/);
	});

	it("gives react-native-firebase Jest, not Vitest", () => {
		run(project, "init", "--preset", "react-native-firebase");
		const claude = read("CLAUDE.md");
		assert.match(claude, /Unit tests with Jest/);
		assert.doesNotMatch(claude, /Vitest/);
		assert.doesNotMatch(read(".github/workflows/test.yml"), /vitest/);
		assert.match(read(".github/workflows/build-check.yml"), /run: npx tsc --noEmit/);
		assert.deepEqual(JSON.parse(read("knip.json")).entry, ["index.js", "App.tsx", "src/index.ts"]);
		const list = run(project, "skills").stdout;
		assert.doesNotMatch(list, /vitest/);
		assert.doesNotMatch(read("ai/agents/ui-auditor.md"), /pet|ScreenWrapper/);
	});

	it("warns about every requirement of the chain, including the mixin", () => {
		write("package.json", '{"scripts":{"test":"jest"},"devDependencies":{"jest":"1"}}\n');
		const result = run(project, "init", "--preset", "react-native-firebase");
		assert.match(result.stderr, /no "test:rules" script/);
		assert.match(result.stderr, /does not depend on firebase-tools/);
		assert.doesNotMatch(result.stderr, /vitest/);
		assert.doesNotMatch(result.stderr, /no "test" script/);
	});

	it("does not add a rules workflow next to an older test.yml that has the rules job", () => {
		write(".github/workflows/test.yml", "jobs:\n  rules-tests:\n    name: Security Rules Tests\n");
		run(project, "init", "--preset", "typescript-vite-firebase");
		assert.ok(!existsSync(path.join(project, ".github/workflows/rules-test.yml")));
	});

	it("does not add issue forms next to older Markdown templates", () => {
		write(".github/ISSUE_TEMPLATE/bug.md", "old");
		run(project, "init", "--preset", "node-ts");
		assert.ok(!existsSync(path.join(project, ".github/ISSUE_TEMPLATE/bug.yml")));
		assert.ok(existsSync(path.join(project, ".github/ISSUE_TEMPLATE/feature.yml")));
	});
});

describe("sync and check", () => {
	it("tells an edited managed file from an outdated one, and sync restores it", () => {
		run(project, "init", "--preset", "node-ts");
		write("ai/agents/planner.md", "edited");
		const check = run(project, "check");
		assert.equal(check.status, 1);
		assert.match(
			check.stdout,
			/edited locally: ai\/agents\/planner\.md \(source core\/managed\/ai\/agents\/planner\.md\); managed by ai-devflow-core, so port the change to the preset's/,
		);

		run(project, "sync");
		assert.match(read("ai/agents/planner.md"), /# Role: planner/);
		// The file matches what the lock recorded, but upstream moved on: the
		// file is outdated, not edited.
		const old = read("ai/agents/README.md").replace("# Development-cycle", "# Old");
		write("ai/agents/README.md", old);
		const state = lock();
		state.files["ai/agents/README.md"].sha256 = createHash("sha256").update(old).digest("hex");
		write(".ai-flow.lock.json", JSON.stringify(state));
		assert.match(
			run(project, "check").stdout,
			/outdated: ai\/agents\/README\.md \(source core\/managed\/ai\/agents\/README\.md\); run ai-flow sync/,
		);
	});

	it("warns about unmanaged files in managed directories and honors localFiles", () => {
		run(project, "init", "--preset", "node-ts");
		write(".claude/agents/argent-inspector.md", "local agent\n");
		let result = run(project, "check");
		assert.match(result.stderr, /unmanaged file in a managed directory: \.claude\/agents\/argent-inspector\.md/);

		const config = JSON.parse(read(".ai-flow.json"));
		config.localFiles = [".claude/agents/argent-inspector.md"];
		write(".ai-flow.json", `${JSON.stringify(config, null, "	")}\n`);
		result = run(project, "check");
		assert.doesNotMatch(result.stderr, /argent-inspector/);

		// A allow-list entry that is not a real local file is a warning.
		config.localFiles = [".claude/agents/argent-inspector.md", ".claude/agents/ghost.md"];
		write(".ai-flow.json", `${JSON.stringify(config, null, "	")}\n`);
		assert.match(run(project, "check").stderr, /localFiles: "\.claude\/agents\/ghost\.md" does not exist\./);
	});

	it("seeds the AI-flow Check workflow pinned to the syncing version", () => {
		run(project, "init", "--preset", "node-ts");
		const text = read(".github/workflows/ai-flow-check.yml");
		assert.match(text, /name: AI-flow Check/);
		assert.match(
			text,
			/npx -y "git\+https:\/\/x-access-token:\$\{\{ github\.token \}\}@github\.com\/Caiorrs-Dev\/ai-devflow-core\.git#v\d+\.\d+\.\d+" check --strict/,
		);
		assert.doesNotMatch(text, /@@/);
	});

	it("never overwrites seeds or the project section of CLAUDE.md", () => {
		run(project, "init", "--preset", "node-ts");
		write("biome.json", "{}\n");
		write("CLAUDE.md", read("CLAUDE.md").replace("## Project\n", "## Project\n\nDomain rule X.\n"));
		run(project, "sync");
		assert.equal(read("biome.json"), "{}\n");
		assert.match(read("CLAUDE.md"), /Domain rule X\./);
		assert.match(read("CLAUDE.md"), /## Development cycle/);
	});

	it("does not bring back a seed the project deleted", () => {
		run(project, "init", "--preset", "node-ts");
		rmSync(path.join(project, ".lintstagedrc.json"));
		const check = run(project, "check");
		assert.doesNotMatch(check.stdout, /lintstagedrc/);
		run(project, "sync");
		assert.ok(!existsSync(path.join(project, ".lintstagedrc.json")));
	});

	it("disabledFiles skips managed files and seeds, and removes ones synced before", () => {
		run(project, "init", "--preset", "node-ts");
		const config = JSON.parse(read(".ai-flow.json"));
		config.disabledFiles = [".github/workflows/back-merge.yml", "knip.json", "nope.txt"];
		write(".ai-flow.json", JSON.stringify(config));
		rmSync(path.join(project, "knip.json"));
		const result = run(project, "sync");
		assert.match(result.stdout, /removed: \.github\/workflows\/back-merge\.yml/);
		assert.match(result.stderr, /disabledFiles: "nope\.txt" is not a file this preset writes/);
		assert.ok(!existsSync(path.join(project, ".github/workflows/back-merge.yml")));
		assert.ok(!existsSync(path.join(project, "knip.json")));
		assert.equal(run(project, "check").status, 1); // skills are not installed yet
		assert.doesNotMatch(run(project, "check").stdout, /back-merge|knip/);
	});

	it("keeps an orphan the project edited, with a warning", () => {
		run(project, "init", "--preset", "node-ts");
		write(".github/workflows/back-merge.yml", "mine\n");
		const config = JSON.parse(read(".ai-flow.json"));
		config.disabledFiles = [".github/workflows/back-merge.yml"];
		write(".ai-flow.json", JSON.stringify(config));
		const result = run(project, "sync");
		assert.match(result.stderr, /back-merge\.yml is no longer managed and was edited locally/);
		assert.equal(read(".github/workflows/back-merge.yml"), "mine\n");
	});

	it("ignores lock entries outside the project instead of deleting them", () => {
		const outside = tempDir("ai-flow-outside-");
		try {
			writeFileSync(path.join(outside, "keep.txt"), "keep me\n");
			const sha = createHash("sha256").update("keep me\n").digest("hex");
			run(project, "init", "--preset", "node-ts");
			const crafted = lock();
			for (const rel of [
				path.relative(project, path.join(outside, "keep.txt")).split(path.sep).join("/"),
				path.join(outside, "keep.txt"),
			]) {
				crafted.files[rel] = { kind: "managed", sha256: sha };
			}
			write(".ai-flow.lock.json", JSON.stringify(crafted));
			const result = run(project, "sync");
			assert.equal(result.status, 0, result.stderr);
			assert.match(result.stderr, /outside the project; ignored/);
			assert.equal(readFileSync(path.join(outside, "keep.txt"), "utf8"), "keep me\n");
			assert.ok(Object.keys(lock().files).every((rel) => !rel.includes("..") && !path.isAbsolute(rel)));
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	});

	it("replaces a symlinked managed file instead of writing through it", (t) => {
		const outside = tempDir("ai-flow-outside-");
		try {
			const victim = path.join(outside, "victim.txt");
			writeFileSync(victim, "untouched\n");
			run(project, "init", "--preset", "node-ts");
			rmSync(path.join(project, "ai/agents/planner.md"));
			try {
				symlinkSync(victim, path.join(project, "ai/agents/planner.md"));
			} catch {
				t.skip("symlinks are not available");
				return;
			}
			const result = run(project, "sync");
			assert.equal(result.status, 0, result.stderr);
			assert.equal(readFileSync(victim, "utf8"), "untouched\n");
			assert.ok(!lstatSync(path.join(project, "ai/agents/planner.md")).isSymbolicLink());
			assert.match(read("ai/agents/planner.md"), /# Role: planner/);
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	});

	it("refuses to write into a symlinked folder that leaves the project", (t) => {
		const outside = tempDir("ai-flow-outside-");
		try {
			write(".ai-flow.json", JSON.stringify({ preset: "node-ts" }));
			try {
				symlinkSync(outside, path.join(project, "ai"), "dir");
			} catch {
				t.skip("symlinks are not available");
				return;
			}
			const result = run(project, "sync");
			assert.equal(result.status, 1);
			assert.match(result.stderr, /refusing to write ai\/.*outside the project/);
			assert.deepEqual(readdirSync(outside), []);
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	});

	it("creates no AGENTS.md or GEMINI.md when CLAUDE.md is disabled", () => {
		write(".ai-flow.json", JSON.stringify({ preset: "node-ts", disabledFiles: ["CLAUDE.md"] }));
		const result = run(project, "sync");
		assert.equal(result.status, 0, result.stderr);
		for (const link of ["CLAUDE.md", "AGENTS.md", "GEMINI.md"]) {
			assert.throws(() => lstatSync(path.join(project, link)), `${link} should not exist`);
		}
		assert.doesNotMatch(result.stderr, /CLAUDE\.md is missing/);
		assert.doesNotMatch(run(project, "check").stdout, /missing link/);
	});

	it("warns instead of linking when the project deleted CLAUDE.md", () => {
		const env = { AI_FLOW_NO_SYMLINK: "1" };
		run(project, "init", "--preset", "node-ts", { env });
		for (const rel of ["CLAUDE.md", "AGENTS.md", "GEMINI.md"]) rmSync(path.join(project, rel));
		const result = run(project, "sync", { env });
		assert.match(result.stderr, /CLAUDE\.md is missing, so AGENTS\.md and GEMINI\.md are not created/);
		assert.ok(!existsSync(path.join(project, "AGENTS.md")));
	});

	it("renders commands.install and commands.installNoScripts, with the project override", () => {
		// Defaults: npm ci everywhere.
		run(project, "init", "--preset", "node-ts");
		assert.match(read(".github/workflows/test.yml"), /run: npm ci\n/);
		assert.match(read(".github/workflows/commitlint.yml"), /run: npm ci --ignore-scripts\n/);
	});

	it("honors a commands.install override (seeds render at init)", () => {
		// Seeds are written once, so the override applies at init; an existing
		// project re-inits or hand-edits its seed workflows.
		write(
			".ai-flow.json",
			JSON.stringify({
				preset: "node-ts",
				vars: { commands: { install: "npm install" } },
			}),
		);
		assert.equal(run(project, "init", "--preset", "node-ts", "--force").status, 0);
		assert.match(read(".github/workflows/test.yml"), /run: npm install\n/);
		assert.doesNotMatch(read(".github/workflows/test.yml"), /npm ci/);
		// installNoScripts keeps its default.
		assert.match(read(".github/workflows/commitlint.yml"), /run: npm ci --ignore-scripts\n/);
	});

	it("re-renders the managed commitlint workflow when commands.installNoScripts changes", () => {
		run(project, "init", "--preset", "node-ts");
		const config = JSON.parse(read(".ai-flow.json"));
		config.vars = { commands: { installNoScripts: "npm install --ignore-scripts" } };
		write(".ai-flow.json", `${JSON.stringify(config, null, "	")}\n`);
		assert.equal(run(project, "sync").status, 0);
		assert.match(read(".github/workflows/commitlint.yml"), /run: npm install --ignore-scripts\n/);
	});

	it("applies project vars and disabled roles, and removes a role disabled later", () => {
		write(
			".ai-flow.json",
			JSON.stringify({
				preset: "node-ts",
				vars: { branches: { integration: "develop" }, language: { collab: "Brazilian Portuguese" } },
			}),
		);
		assert.equal(run(project, "sync").status, 0);
		assert.ok(existsSync(path.join(project, ".claude/agents/product-owner.md")));
		assert.match(read(".github/workflows/back-merge.yml"), /ref: develop/);
		assert.match(read("ai/agents/README.md"), /test\s+labels in Brazilian Portuguese/);

		const config = JSON.parse(read(".ai-flow.json"));
		config.disabledRoles = ["product-owner", "typo-role"];
		write(".ai-flow.json", JSON.stringify(config));
		const result = run(project, "sync");
		assert.match(result.stderr, /disabledRoles: no role "typo-role"/);
		assert.ok(!existsSync(path.join(project, "ai/agents/product-owner.md")));
		assert.ok(!existsSync(path.join(project, ".claude/agents/product-owner.md")));
	});

	it("adds tools and tool rules from vars to every role", () => {
		write(
			".ai-flow.json",
			JSON.stringify({
				preset: "node-ts",
				vars: { agents: { extraTools: ["mcp__codegraph__codegraph_explore"], toolRules: "- Use rtk." } },
			}),
		);
		run(project, "sync");
		assert.match(read(".claude/agents/planner.md"), /tools: Bash, Read, Grep, Glob, Write, Edit, mcp__codegraph/);
		assert.match(read("ai/agents/README.md"), /^- Use rtk\.$/m);
		assert.match(read(".claude/agents/reviewer.md"), /mcp__codegraph__codegraph_explore/);
	});

	it("makes hooks and scripts executable", { skip: process.platform === "win32" }, () => {
		run(project, "init", "--preset", "node-ts");
		for (const rel of [".husky/pre-commit", "scripts/ai/next-adr-number.sh", "scripts/ai/adr-index.sh"]) {
			assert.ok(statSync(path.join(project, rel)).mode & 0o100, `${rel} not executable`);
		}
	});

	it("warns about missing package.json scripts without editing package.json", () => {
		write("package.json", '{"scripts":{"lint":"biome check ."}}\n');
		const result = run(project, "init", "--preset", "node-ts");
		assert.match(result.stderr, /no "knip" script/);
		assert.equal(read("package.json"), '{"scripts":{"lint":"biome check ."}}\n');
	});

	it("warns when the release manifest and package.json disagree", () => {
		write("package.json", '{"version":"2.0.0"}\n');
		write(".release-please-manifest.json", '{".":"1.0.0"}\n');
		assert.match(
			run(project, "init", "--preset", "node-ts").stderr,
			/manifest\.json says 1\.0\.0 but package\.json says 2\.0\.0/,
		);
	});

	it("sync --dry-run writes nothing", () => {
		run(project, "init", "--preset", "node-ts");
		rmSync(path.join(project, "ai/agents/planner.md"));
		const before = files(project).sort();
		const result = run(project, "sync", "--dry-run");
		assert.match(result.stdout, /would write: missing: ai\/agents\/planner\.md/);
		assert.deepEqual(files(project).sort(), before);
	});

	it("warns about missing and malformed CLAUDE.md markers", () => {
		write("CLAUDE.md", "# Mine\n<!-- ai-flow:shared-core:end -->\n<!-- ai-flow:shared-core:start -->\n");
		const result = run(project, "init", "--preset", "node-ts");
		assert.match(result.stderr, /no ai-flow:stack-preset markers/);
		assert.match(result.stderr, /out-of-order ai-flow:shared-core markers/);
	});

	it("check --strict fails on warnings and --json prints a report", () => {
		run(project, "init", "--preset", "node-ts");
		rmSync(path.join(project, "AGENTS.md"));
		write("AGENTS.md", "my own rules\n");
		run(project, "skills", "install", { env: stubSkillsCli() });
		assert.equal(run(project, "check").status, 0);
		assert.equal(run(project, "check", "--strict").status, 1);
		const report = JSON.parse(run(project, "check", "--strict", "--json").stdout);
		assert.equal(report.ok, false);
		assert.match(report.warnings.join("\n"), /AGENTS\.md exists and is not a symlink/);
	});

	it("warns when commands.* and a workflow's install step use different package managers", () => {
		run(project, "init", "--preset", "react-native-firebase");
		const config = JSON.parse(read(".ai-flow.json"));
		config.vars = { commands: { testCoverage: "yarn test --silent" } };
		write(".ai-flow.json", `${JSON.stringify(config, null, "	")}\n`);
		// The seeded workflow still holds the command from `init`, so this is the
		// "a re-seed would mix managers" case.
		assert.match(
			run(project, "check").stderr,
			/commands\.testCoverage runs "yarn" but .*test\.yml installs with "npm": the workflow does not run this command today/,
		);
	});

	it("warns that CI installs one manager and runs another when the workflow runs the command", () => {
		run(project, "init", "--preset", "react-native-firebase");
		const config = JSON.parse(read(".ai-flow.json"));
		config.vars = { commands: { testCoverage: "yarn test --silent" } };
		write(".ai-flow.json", `${JSON.stringify(config, null, "	")}\n`);
		write(
			".github/workflows/test.yml",
			read(".github/workflows/test.yml").replace("npx jest --coverage --silent", "yarn test --silent"),
		);
		assert.match(run(project, "check").stderr, /the CI would install one package manager and run another/);
	});

	it("names corepack when packageManager pins the manager the command uses", () => {
		run(project, "init", "--preset", "react-native-firebase");
		const config = JSON.parse(read(".ai-flow.json"));
		config.vars = { commands: { testCoverage: "yarn test --silent" } };
		write(".ai-flow.json", `${JSON.stringify(config, null, "	")}\n`);
		write("package.json", `${JSON.stringify({ name: "x", packageManager: "yarn@4.18.0" }, null, "	")}\n`);
		assert.match(run(project, "check").stderr, /also needs corepack enabled on the runner/);
	});

	it("stays quiet when commands.* use the manager the workflows install with", () => {
		run(project, "init", "--preset", "react-native-firebase");
		assert.doesNotMatch(run(project, "check").stderr, /commands\.[a-zA-Z]+ runs/);
	});

	it("writes copies instead of symlinks when symlinks are unavailable, and refreshes them", () => {
		const env = { AI_FLOW_NO_SYMLINK: "1" };
		run(project, "init", "--preset", "node-ts", { env });
		assert.ok(!lstatSync(path.join(project, "AGENTS.md")).isSymbolicLink());
		assert.equal(read("AGENTS.md"), read("CLAUDE.md"));
		assert.equal(lock().links["AGENTS.md"], "copy");
		write("CLAUDE.md", read("CLAUDE.md").replace("## Project\n", "## Project\n\nRule Y.\n"));
		assert.match(run(project, "check", { env }).stdout, /stale copy: AGENTS\.md/);
		run(project, "sync", { env });
		assert.match(read("GEMINI.md"), /Rule Y\./);
	});

	it("recognizes a symlink checked out as a plain file", () => {
		run(project, "init", "--preset", "node-ts");
		rmSync(path.join(project, "AGENTS.md"));
		write("AGENTS.md", "CLAUDE.md");
		write(".ai-flow.lock.json", JSON.stringify({ ...lock(), links: {} }));
		assert.match(run(project, "check").stderr, /core\.symlinks=false/);
	});

	it("diff shows what sync would change", () => {
		run(project, "init", "--preset", "node-ts");
		write("ai/agents/planner.md", read("ai/agents/planner.md").replace("# Role: planner", "# Role: mine"));
		const out = run(project, "diff").stdout;
		assert.match(out, /--- a\/ai\/agents\/planner\.md\n\+\+\+ b\/ai\/agents\/planner\.md/);
		assert.match(out, /^-# Role: mine$/m);
		assert.match(out, /^\+# Role: planner$/m);
	});

	it("warns when the lock comes from another version, without drift", () => {
		run(project, "init", "--preset", "node-ts");
		run(project, "skills", "install", { env: stubSkillsCli() });
		write(".ai-flow.lock.json", JSON.stringify({ ...lock(), version: "0.0.1" }, null, "\t"));
		const check = run(project, "check");
		assert.equal(check.status, 0, check.stdout);
		assert.match(check.stderr, /written by ai-devflow-core 0\.0\.1/);
	});

	it("tolerates CRLF line endings", () => {
		run(project, "init", "--preset", "node-ts");
		run(project, "skills", "install", { env: stubSkillsCli() });
		write("ai/agents/planner.md", read("ai/agents/planner.md").replace(/\n/g, "\r\n"));
		assert.equal(run(project, "check").status, 0);
	});
});

describe("errors", () => {
	it("explain a bad config, bad JSON and bad options", () => {
		write(".ai-flow.json", "{}");
		assert.match(run(project, "sync").stderr, /"preset" must name a preset/);
		write(".ai-flow.json", '{"preset":"node-ts",');
		assert.match(run(project, "sync").stderr, /\.ai-flow\.json: invalid JSON/);
		write(".ai-flow.json", '{"preset":"node-ts","prest":1}');
		assert.match(run(project, "sync").stderr, /unknown key "prest"/);
		assert.match(run(project, "frobnicate").stderr, /unknown command "frobnicate"/);
		assert.equal(run(project, "frobnicate").status, 1);
		assert.match(run(project, "--bogus").stderr, /Unknown option: --bogus/);
	});

	it("vars with quotes that would break a JSON seed fail with the file name", () => {
		write(".ai-flow.json", JSON.stringify({ preset: "node-ts", vars: { project: { version: 'x"y' } } }));
		assert.match(run(project, "sync").stderr, /release-please-manifest\.json: renders to invalid JSON/);
	});

	it("--help, --version, roles, vars and presets", () => {
		assert.match(run(project, "--help").stdout, /Usage: ai-flow/);
		assert.match(run(project, "--version").stdout, /^\d+\.\d+\.\d+/);
		run(project, "init", "--preset", "node-ts");
		assert.match(run(project, "roles").stdout, /^planner \(opus\): Bash/m);
		assert.equal(JSON.parse(run(project, "vars").stdout).branches.integration, "stage");
		assert.match(run(project, "presets").stdout, /Mixins[\s\S]*firebase/);
	});
});
