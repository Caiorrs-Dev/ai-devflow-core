import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { applyBlocks, deepMerge, render } from "../bin/ai-flow.mjs";

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../bin/ai-flow.mjs");

const run = (dir, ...args) => {
	const options = typeof args.at(-1) === "object" ? args.pop() : {};
	return spawnSync(process.execPath, [CLI, ...args, "--dir", dir], {
		encoding: "utf8",
		env: { ...process.env, ...options.env },
	});
};

// A fake `skills` CLI: records each call as one JSON line and, for project
// installs and removals, keeps skills-lock.json in step like the real one.
function stubSkillsCli() {
	const dir = mkdtempSync(path.join(tmpdir(), "ai-flow-stub-"));
	const log = path.join(dir, "calls.jsonl");
	const stub = path.join(dir, "skills.mjs");
	writeFileSync(
		stub,
		`import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
if (args.includes("-g")) process.exit(0);
const lockPath = "skills-lock.json";
const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : { version: 1, skills: {} };
const names = args.slice(args.indexOf("-s") + 1).filter((a) => !a.startsWith("-"));
if (args[0] === "add") for (const name of names) lock.skills[name] = { source: args[1] };
if (args[0] === "remove") for (const name of names) delete lock.skills[name];
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\\n");
`,
	);
	return { AI_FLOW_SKILLS_CMD: `${process.execPath} ${stub}`, AI_FLOW_STUB_LOG: log };
}

const readCalls = (env) =>
	readFileSync(env.AI_FLOW_STUB_LOG, "utf8").trim().split("\n").map((line) => JSON.parse(line));

let project;
beforeEach(() => {
	project = mkdtempSync(path.join(tmpdir(), "ai-flow-"));
});
afterEach(() => rmSync(project, { recursive: true, force: true }));

const read = (rel) => readFileSync(path.join(project, rel), "utf8");

describe("render", () => {
	it("replaces dotted vars and leaves GitHub Actions expressions alone", () => {
		const out = render("ref: @@b.main@@ ${{ github.ref }}", { b: { main: "main" } }, "t");
		assert.equal(out, "ref: main ${{ github.ref }}");
	});

	it("fails on unknown vars, naming the file", () => {
		assert.throws(() => render("@@nope.x@@", {}, "core/x.md"), /core\/x\.md: unknown var\(s\) nope\.x/);
	});

	it("indents multi-line values to the placeholder's indentation", () => {
		const out = render("list:\n   @@v@@\nend", { v: "- a\n- b" }, "t");
		assert.equal(out, "list:\n   - a\n   - b\nend");
	});
});

describe("deepMerge", () => {
	it("merges nested objects and replaces arrays", () => {
		assert.deepEqual(deepMerge({ a: { x: 1, y: 2 }, l: [1] }, { a: { y: 3 }, l: [2] }), {
			a: { x: 1, y: 3 },
			l: [2],
		});
	});
});

describe("applyBlocks", () => {
	it("rewrites only the marked block and reports missing markers", () => {
		const text = "top\n<!-- ai-flow:shared-core:start -->\nold\n<!-- ai-flow:shared-core:end -->\nmine";
		const { text: out, missing } = applyBlocks(text, { "shared-core": "new", "stack-preset": "s" });
		assert.match(out, /start -->\n<!-- Managed[^\n]*-->\nnew\n<!-- ai-flow:shared-core:end -->\nmine$/);
		assert.deepEqual(missing, ["stack-preset"]);
	});
});

describe("cli", () => {
	it("init syncs a full project for every preset", () => {
		for (const preset of ["node-ts", "typescript-vite-firebase"]) {
			rmSync(project, { recursive: true, force: true });
			project = mkdtempSync(path.join(tmpdir(), "ai-flow-"));
			const result = run(project, "init", "--preset", preset);
			assert.equal(result.status, 0, result.stderr);
			for (const rel of [
				"ai/agents/planner.md",
				".claude/agents/planner.md",
				".claude/skills/ship-issue/SKILL.md",
				".github/workflows/back-merge.yml",
				"docs/decisions/_template.md",
				"CLAUDE.md",
			]) {
				assert.ok(existsSync(path.join(project, rel)), `${preset}: missing ${rel}`);
			}
			assert.equal(readlinkSync(path.join(project, "AGENTS.md")), "CLAUDE.md");
			assert.doesNotMatch(read("ai/agents/quality-gate.md"), /@@/);
			assert.doesNotMatch(read(".github/workflows/test.yml"), /@@/);
			// Skills are not copied; until they are installed the lock is
			// incomplete, so `check` reports that drift.
			assert.match(run(project, "check").stdout, /skills not in skills-lock\.json/);
			assert.equal(run(project, "skills", "install", { env: stubSkillsCli() }).status, 0);
			assert.equal(run(project, "check").status, 0, `${preset}: check after install`);
		}
	});

	it("adds the firebase roles only with the firebase preset", () => {
		run(project, "init", "--preset", "node-ts");
		assert.ok(!existsSync(path.join(project, "ai/agents/rules-auditor.md")));

		const other = mkdtempSync(path.join(tmpdir(), "ai-flow-"));
		run(other, "init", "--preset", "typescript-vite-firebase");
		assert.ok(existsSync(path.join(other, ".claude/agents/rules-auditor.md")));
		assert.match(readFileSync(path.join(other, "ai/agents/planner.md"), "utf8"), /public mirrors/);
		rmSync(other, { recursive: true, force: true });
	});

	it("check reports a hand-edited managed file and sync restores it", () => {
		run(project, "init", "--preset", "node-ts");
		writeFileSync(path.join(project, "ai/agents/planner.md"), "edited");
		const check = run(project, "check");
		assert.equal(check.status, 1);
		assert.match(check.stdout, /modified: ai\/agents\/planner\.md/);
		run(project, "sync");
		assert.match(read("ai/agents/planner.md"), /# Role: planner/);
	});

	it("never overwrites seeds or the project section of CLAUDE.md", () => {
		run(project, "init", "--preset", "node-ts");
		writeFileSync(path.join(project, "biome.json"), "{}\n");
		writeFileSync(
			path.join(project, "CLAUDE.md"),
			read("CLAUDE.md").replace("## Project\n", "## Project\n\nDomain rule X.\n"),
		);
		run(project, "sync");
		assert.equal(read("biome.json"), "{}\n");
		assert.match(read("CLAUDE.md"), /Domain rule X\./);
		assert.match(read("CLAUDE.md"), /## Development cycle/);
	});

	it("applies project vars and disabled roles", () => {
		writeFileSync(
			path.join(project, ".ai-flow.json"),
			JSON.stringify({
				preset: "node-ts",
				vars: { branches: { integration: "develop" }, language: { collab: "Brazilian Portuguese" } },
				disabledRoles: ["product-owner"],
			}),
		);
		assert.equal(run(project, "sync").status, 0);
		assert.match(read(".github/workflows/back-merge.yml"), /ref: develop/);
		assert.match(read("ai/agents/README.md"), /test\s+labels in Brazilian Portuguese/);
		assert.ok(!existsSync(path.join(project, "ai/agents/product-owner.md")));
		assert.ok(!existsSync(path.join(project, ".claude/agents/product-owner.md")));
	});

	it("makes hooks and scripts executable", () => {
		run(project, "init", "--preset", "node-ts");
		for (const rel of [".husky/pre-commit", "scripts/ai/next-adr-number.sh"]) {
			assert.ok(statSync(path.join(project, rel)).mode & 0o100, `${rel} not executable`);
		}
	});

	it("warns about missing package.json scripts without editing package.json", () => {
		writeFileSync(path.join(project, "package.json"), '{"scripts":{"lint":"biome check ."}}\n');
		const result = run(project, "init", "--preset", "node-ts");
		assert.match(result.stderr, /no "knip" script/);
		assert.equal(read("package.json"), '{"scripts":{"lint":"biome check ."}}\n');
	});

	it("rejects an unknown preset", () => {
		const result = run(project, "init", "--preset", "cobol");
		assert.equal(result.status, 1);
		assert.match(result.stderr, /Unknown preset "cobol"/);
	});

	it("ships ship-issue as a managed Claude skill and lists third-party skills by source", () => {
		run(project, "init", "--preset", "typescript-vite-firebase");
		assert.match(read(".claude/skills/ship-issue/SKILL.md"), /name: ship-issue/);
		assert.doesNotMatch(read(".claude/skills/ship-issue/SKILL.md"), /@@/);
		const list = run(project, "skills");
		assert.match(list.stdout, /cursor\/plugins: thermo-nuclear-code-quality-review/);
		assert.match(list.stdout, /antfu\/skills: vitest, vite/);
		assert.match(list.stdout, /Not in skills-lock\.json yet/);
		const check = run(project, "check");
		assert.equal(check.status, 1);
		assert.match(check.stdout, /skills not in skills-lock\.json: thermo-nuclear-code-quality-review \(cursor\/plugins\)/);
	});

	it("skills install runs the skills CLI per source for unlocked skills only", () => {
		run(project, "init", "--preset", "node-ts");
		writeFileSync(
			path.join(project, "skills-lock.json"),
			JSON.stringify({ version: 1, skills: { vitest: { source: "antfu/skills" } } }),
		);
		const env = stubSkillsCli();
		const result = run(project, "skills", "install", { env });
		assert.equal(result.status, 0, result.stderr);
		const calls = readCalls(env);
		assert.deepEqual(calls, [
			["add", "cursor/plugins", "-s", "thermo-nuclear-code-quality-review", "-y", "--full-depth"],
			["add", "addyosmani/web-quality-skills", "-s", "best-practices", "-y", "--full-depth"],
		]);
		assert.deepEqual(Object.keys(JSON.parse(read("skills-lock.json")).skills).sort(), [
			"best-practices",
			"thermo-nuclear-code-quality-review",
			"vitest",
		]);
	});

	it("skills add and remove edit .ai-flow.json and call the skills CLI", () => {
		run(project, "init", "--preset", "node-ts");
		const env = stubSkillsCli();
		assert.equal(run(project, "skills", "add", "JuliusBrussee/caveman", "caveman", { env }).status, 0);
		assert.deepEqual(JSON.parse(read(".ai-flow.json")).skills, { "JuliusBrussee/caveman": ["caveman"] });
		assert.equal(run(project, "skills", "remove", "best-practices", { env }).status, 0);
		assert.deepEqual(JSON.parse(read(".ai-flow.json")).disabledSkills, ["best-practices"]);
		assert.doesNotMatch(run(project, "skills").stdout, /best-practices/);
		assert.deepEqual(readCalls(env), [
			["add", "JuliusBrussee/caveman", "-s", "caveman", "-y", "--full-depth"],
			["remove", "-s", "best-practices", "-y"],
		]);
	});

	it("skills restore and global use the lock file and the machine manifest", () => {
		const env = stubSkillsCli();
		const home = mkdtempSync(path.join(tmpdir(), "ai-flow-home-"));
		run(project, "init", "--preset", "node-ts");
		run(project, "skills", "restore", { env });
		run(project, "skills", "global", "caveman", "impeccable", "--home", home, { env });
		const calls = readCalls(env);
		assert.deepEqual(calls[0], ["experimental_install", "-y"]);
		assert.deepEqual(calls.slice(1).map((args) => args[1]).sort(), ["JuliusBrussee/caveman", "pbakaus/impeccable"]);
		assert.ok(calls.slice(1).every((args) => args.includes("-g")));
		rmSync(home, { recursive: true, force: true });
	});

	it("skills snapshot groups this machine's global skills by source", () => {
		const home = mkdtempSync(path.join(tmpdir(), "ai-flow-home-"));
		mkdirSync(path.join(home, ".agents"));
		writeFileSync(
			path.join(home, ".agents/.skill-lock.json"),
			JSON.stringify({ skills: { b: { source: "o/r" }, a: { source: "o/r" }, c: { source: "x/y" } } }),
		);
		const out = path.join(home, "global.json");
		assert.equal(run(project, "skills", "snapshot", "--home", home, "--out", out).status, 0);
		assert.deepEqual(JSON.parse(readFileSync(out, "utf8")).skills, { "o/r": ["a", "b"], "x/y": ["c"] });
		rmSync(home, { recursive: true, force: true });
	});
});
