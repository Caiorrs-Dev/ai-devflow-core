import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
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

const run = (dir, ...args) =>
	spawnSync(process.execPath, [CLI, ...args, "--dir", dir], { encoding: "utf8" });

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
			assert.equal(run(project, "check").status, 0);
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

	it("syncs core and preset skills and maintains .claude/skills symlinks", () => {
		run(project, "init", "--preset", "typescript-vite-firebase");
		// Core skill
		assert.ok(existsSync(path.join(project, ".agents/skills/ship-issue/SKILL.md")));
		assert.ok(existsSync(path.join(project, ".agents/skills/thermo-nuclear-code-quality-review/SKILL.md")));
		assert.equal(readlinkSync(path.join(project, ".claude/skills/ship-issue")), "../../.agents/skills/ship-issue");
		assert.equal(
			readlinkSync(path.join(project, ".claude/skills/thermo-nuclear-code-quality-review")),
			"../../.agents/skills/thermo-nuclear-code-quality-review",
		);

		// Preset skills
		assert.ok(existsSync(path.join(project, ".agents/skills/vitest/SKILL.md")));
		assert.ok(existsSync(path.join(project, ".agents/skills/react/SKILL.md")));
		assert.equal(readlinkSync(path.join(project, ".claude/skills/react")), "../../.agents/skills/react");
	});

	it("skills add and remove manage project skills and update config", () => {
		run(project, "init", "--preset", "node-ts");
		assert.ok(!existsSync(path.join(project, ".agents/skills/caveman/SKILL.md")));

		// Add catalog skill
		const addRes = run(project, "skills", "add", "caveman");
		assert.equal(addRes.status, 0);
		assert.ok(existsSync(path.join(project, ".agents/skills/caveman/SKILL.md")));
		assert.equal(readlinkSync(path.join(project, ".claude/skills/caveman")), "../../.agents/skills/caveman");

		// Remove skill
		const remRes = run(project, "skills", "remove", "caveman");
		assert.equal(remRes.status, 0);
		const plan = run(project, "skills");
		const activeSection = plan.stdout.split("\n\n")[0];
		assert.doesNotMatch(activeSection, /- caveman/);
	});

	it("skills global installs recommended skills to user home", () => {
		const fakeHome = mkdtempSync(path.join(tmpdir(), "ai-flow-home-"));
		run(project, "init", "--preset", "node-ts");
		const res = run(project, "skills", "global", "--home", fakeHome);
		assert.equal(res.status, 0);

		// Recommended global skill "caveman" installed into home
		assert.ok(existsSync(path.join(fakeHome, ".agents/skills/caveman/SKILL.md")));
		assert.equal(readlinkSync(path.join(fakeHome, ".claude/skills/caveman")), "../../.agents/skills/caveman");
		rmSync(fakeHome, { recursive: true, force: true });
	});
});
