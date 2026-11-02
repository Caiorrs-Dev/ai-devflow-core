import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { readCalls, run, stubSkillsCli, tempDir } from "./helpers.mjs";

let project;
beforeEach(() => {
	project = tempDir();
});
afterEach(() => rmSync(project, { recursive: true, force: true }));

const read = (rel) => readFileSync(path.join(project, rel), "utf8");
const config = () => JSON.parse(read(".ai-flow.json"));

describe("skills", () => {
	it("ships ship-issue as a managed Claude skill and lists third-party skills by source", () => {
		run(project, "init", "--preset", "typescript-vite-firebase");
		assert.match(read(".claude/skills/ship-issue/SKILL.md"), /name: ship-issue/);
		const list = run(project, "skills");
		assert.match(list.stdout, /cursor\/plugins: thermo-nuclear-code-quality-review/);
		assert.match(list.stdout, /antfu\/skills: vitest, vite/);
		assert.match(list.stdout, /Not in skills-lock\.json yet/);
		const check = run(project, "check");
		assert.equal(check.status, 1);
		assert.match(
			check.stdout,
			/skills not in skills-lock\.json: thermo-nuclear-code-quality-review \(cursor\/plugins\)/,
		);
	});

	it("install runs the skills CLI per source for unlocked skills only", () => {
		run(project, "init", "--preset", "node-ts");
		writeFileSync(
			path.join(project, "skills-lock.json"),
			JSON.stringify({ version: 1, skills: { vitest: { source: "antfu/skills" } } }),
		);
		const env = stubSkillsCli();
		const result = run(project, "skills", "install", { env });
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(readCalls(env), [
			["add", "cursor/plugins", "-s", "thermo-nuclear-code-quality-review", "-y", "--full-depth"],
			["add", "addyosmani/web-quality-skills", "-s", "best-practices", "-y", "--full-depth"],
		]);
		assert.deepEqual(Object.keys(JSON.parse(read("skills-lock.json")).skills).sort(), [
			"best-practices",
			"thermo-nuclear-code-quality-review",
			"vitest",
		]);
	});

	it("install tries every source when one fails, and exits 1", () => {
		run(project, "init", "--preset", "node-ts");
		const env = stubSkillsCli({ failSources: ["cursor/plugins"] });
		const result = run(project, "skills", "install", { env });
		assert.equal(result.status, 1);
		assert.equal(readCalls(env).length, 3);
		assert.match(result.stderr, /failed: skills add cursor\/plugins/);
	});

	it("a skill locked from another source is drift", () => {
		run(project, "init", "--preset", "node-ts");
		run(project, "skills", "install", { env: stubSkillsCli() });
		const lock = JSON.parse(read("skills-lock.json"));
		lock.skills.vitest.source = "someone/else";
		writeFileSync(path.join(project, "skills-lock.json"), JSON.stringify(lock));
		const check = run(project, "check");
		assert.equal(check.status, 1);
		assert.match(check.stdout, /skill vitest is locked from someone\/else, not antfu\/skills/);
	});

	it("add and remove edit .ai-flow.json and call the skills CLI", () => {
		run(project, "init", "--preset", "node-ts");
		const env = stubSkillsCli();
		assert.equal(run(project, "skills", "add", "JuliusBrussee/caveman", "caveman", { env }).status, 0);
		assert.deepEqual(config().skills, { "JuliusBrussee/caveman": ["caveman"] });
		assert.equal(run(project, "skills", "remove", "best-practices", { env }).status, 0);
		assert.deepEqual(config().disabledSkills, ["best-practices"]);
		assert.doesNotMatch(run(project, "skills").stdout, /best-practices/);
		assert.deepEqual(readCalls(env), [
			["add", "JuliusBrussee/caveman", "-s", "caveman", "-y", "--full-depth"],
			["remove", "-s", "best-practices", "-y"],
		]);
	});

	it("add and remove with --dry-run change nothing", () => {
		run(project, "init", "--preset", "node-ts");
		const before = read(".ai-flow.json");
		const env = stubSkillsCli();
		run(project, "skills", "add", "foo/bar", "baz", "--dry-run", { env });
		run(project, "skills", "remove", "vitest", "--dry-run", { env });
		assert.equal(read(".ai-flow.json"), before);
		assert.throws(() => readCalls(env));
	});

	it("add leaves the config alone when the install fails, and rejects a bad source", () => {
		run(project, "init", "--preset", "node-ts");
		const before = read(".ai-flow.json");
		const result = run(project, "skills", "add", "foo/bar", "baz", {
			env: stubSkillsCli({ failSources: ["foo/bar"] }),
		});
		assert.equal(result.status, 1);
		assert.equal(read(".ai-flow.json"), before);
		assert.match(run(project, "skills", "add", "not-a-source", "x").stderr, /not an <owner>\/<repo> source/);
		assert.match(run(project, "skills", "add", "foo/bar", "a;b").stderr, /not skill names: "a;b"/);
		assert.equal(read(".ai-flow.json"), before);
	});

	it("restore and global use the lock file and the machine manifest", () => {
		const env = stubSkillsCli();
		const home = tempDir("ai-flow-home-");
		run(project, "init", "--preset", "node-ts");
		assert.match(run(project, "skills", "restore", { env }).stderr, /skills-lock\.json not found/);
		writeFileSync(path.join(project, "skills-lock.json"), '{"skills":{}}');
		run(project, "skills", "restore", { env });
		run(project, "skills", "global", "caveman", "impeccable", "--home", home, { env });
		const calls = readCalls(env);
		assert.deepEqual(calls[0], ["experimental_install", "-y"]);
		assert.deepEqual(
			calls
				.slice(1)
				.map((args) => args[1])
				.sort(),
			["JuliusBrussee/caveman", "pbakaus/impeccable"],
		);
		assert.ok(calls.slice(1).every((args) => args.includes("-g")));
		assert.match(
			run(project, "skills", "global", "no-such-skill", "--home", home, { env }).stderr,
			/not in .*: no-such-skill/,
		);
		rmSync(home, { recursive: true, force: true });
	});

	it("stops when the global manifest is missing instead of installing nothing", () => {
		run(project, "init", "--preset", "node-ts");
		const missing = path.join(project, "no-manifest.json");
		const result = run(project, "skills", "global", "--file", missing);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /no global skills manifest/);
	});

	it("snapshot groups this machine's global skills by source and skips sourceless entries", () => {
		const home = tempDir("ai-flow-home-");
		mkdirSync(path.join(home, ".agents"));
		writeFileSync(
			path.join(home, ".agents/.skill-lock.json"),
			JSON.stringify({ skills: { b: { source: "o/r" }, a: { source: "o/r" }, c: { source: "x/y" }, d: {} } }),
		);
		const out = path.join(home, "global.json");
		const result = run(project, "skills", "snapshot", "--home", home, "--out", out);
		assert.equal(result.status, 0);
		assert.match(result.stderr, /d has no source/);
		assert.deepEqual(JSON.parse(readFileSync(out, "utf8")).skills, { "o/r": ["a", "b"], "x/y": ["c"] });
		rmSync(home, { recursive: true, force: true });
	});

	it("warns about disabledSkills that match nothing", () => {
		writeFileSync(path.join(project, ".ai-flow.json"), JSON.stringify({ preset: "node-ts", disabledSkills: ["nope"] }));
		assert.match(run(project, "sync").stderr, /disabledSkills: no skill "nope"/);
	});
});
