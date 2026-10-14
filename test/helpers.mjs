import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../bin/ai-flow.mjs");

export const tempDir = (prefix = "ai-flow-") => mkdtempSync(path.join(tmpdir(), prefix));

/**
 * Runs the CLI against `dir`. A trailing object sets extra env vars.
 * @param {string} dir
 * @param {...any} args
 */
export function run(dir, ...args) {
	const options = typeof args.at(-1) === "object" ? args.pop() : {};
	return spawnSync(process.execPath, [CLI, ...args, "--dir", dir], {
		encoding: "utf8",
		env: { ...process.env, ...options.env },
	});
}

/**
 * A fake `skills` CLI: records each call as one JSON line and, for project
 * installs and removals, keeps skills-lock.json in step like the real one.
 * `failSources` makes `add` fail for those sources.
 * @param {{ failSources?: string[] }} [options]
 */
export function stubSkillsCli({ failSources = [] } = {}) {
	const dir = tempDir("ai-flow-stub-");
	const log = path.join(dir, "calls.jsonl");
	const stub = path.join(dir, "skills.mjs");
	writeFileSync(
		stub,
		`import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
if (args[0] === "add" && ${JSON.stringify(failSources)}.includes(args[1])) process.exit(3);
if (args.includes("-g")) process.exit(0);
const lockPath = "skills-lock.json";
const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : { version: 1, skills: {} };
const names = args.slice(args.indexOf("-s") + 1).filter((a) => !a.startsWith("-"));
if (args[0] === "add") for (const name of names) lock.skills[name] = { source: args[1] };
if (args[0] === "remove") for (const name of names) delete lock.skills[name];
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\\n");
`,
	);
	// JSON form, so a Node path with spaces survives.
	return { AI_FLOW_SKILLS_CMD: JSON.stringify([process.execPath, stub]), AI_FLOW_STUB_LOG: log };
}

/** @param {Record<string, string>} env */
export const readCalls = (env) =>
	readFileSync(env.AI_FLOW_STUB_LOG, "utf8")
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));

/**
 * A fake `gh`: answers from a map of "<args joined by space>" to
 * `{ status?, stdout }`; anything else exits 1 with "Not Found".
 * @param {Record<string, { status?: number, stdout?: unknown }>} answers
 */
export function stubGhCli(answers) {
	const dir = tempDir("ai-flow-gh-");
	const stub = path.join(dir, "gh.mjs");
	writeFileSync(
		stub,
		`const answers = ${JSON.stringify(answers)};
const key = process.argv.slice(2).join(" ");
const answer = answers[key];
if (!answer) { process.stderr.write("HTTP 404: Not Found (" + key + ")\\n"); process.exit(1); }
const out = answer.stdout ?? "";
process.stdout.write(typeof out === "string" ? out : JSON.stringify(out));
process.exit(answer.status ?? 0);
`,
	);
	return { AI_FLOW_GH_CMD: JSON.stringify([process.execPath, stub]) };
}
