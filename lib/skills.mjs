// Third-party skills: resolved by ai-flow, installed and locked by the `skills`
// CLI (npx skills). Nothing here copies skill files.

import { existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIG_FILE, readConfig, writeConfig } from "./config.mjs";
import { layersFor, mergeSkillMaps, ROOT, resolveSkills } from "./layers.mjs";
import { isPlainObject, readJsonIfExists, runTool, SKILL_NAME, SKILL_SOURCE, splitCommand } from "./util.mjs";

export const SKILLS_LOCK = "skills-lock.json";
export const GLOBAL_LOCK = path.join(".agents", ".skill-lock.json");

/** @param {string[]} names */
function checkSkillNames(names) {
	const bad = names.filter((name) => !SKILL_NAME.test(name));
	if (bad.length > 0) throw new Error(`not skill names: ${bad.map((name) => JSON.stringify(name)).join(", ")}`);
}

/**
 * Same repository whatever the spelling: `owner/repo`, `github:owner/repo`,
 * `https://github.com/owner/repo.git`.
 * @param {unknown} source
 */
export function normalizeSource(source) {
	return String(source ?? "")
		.trim()
		.replace(/^github:/i, "")
		.replace(/^https?:\/\/github\.com\//i, "")
		.replace(/\.git$/i, "")
		.replace(/\/+$/, "")
		.toLowerCase();
}

/**
 * Compares the wanted skills with a skills-lock.json. `missing` groups absent
 * skills by source; `mismatched` lists skills locked from another source (two
 * sources can ship a skill with the same name).
 * @param {Map<string, Set<string>>} skills
 * @param {string} lockPath
 */
export function skillLockStatus(skills, lockPath) {
	const lock = readJsonIfExists(lockPath, { skills: {} });
	const entries = isPlainObject(lock?.skills) ? lock.skills : {};
	/** @type {Map<string, string[]>} */
	const missing = new Map();
	/** @type {{ name: string, expected: string, actual: string }[]} */
	const mismatched = [];
	for (const [source, names] of skills) {
		for (const name of names) {
			const entry = Object.hasOwn(entries, name) ? entries[name] : undefined;
			if (!entry) {
				missing.set(source, [...(missing.get(source) ?? []), name]);
			} else if (entry.source && normalizeSource(entry.source) !== normalizeSource(source)) {
				mismatched.push({ name, expected: source, actual: String(entry.source) });
			}
		}
	}
	return { missing, mismatched };
}

/**
 * Skills the lock file does not list yet, grouped by source.
 * @param {Map<string, Set<string>>} skills
 * @param {string} lockPath
 */
export const missingSkills = (skills, lockPath) => skillLockStatus(skills, lockPath).missing;

/**
 * The `skills` CLI argv. AI_FLOW_SKILLS_CMD replaces it (the tests use a stub):
 * a JSON array, or a command line with quotes for paths that contain spaces.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function skillsCommand(env = process.env) {
	return env.AI_FLOW_SKILLS_CMD ? splitCommand(env.AI_FLOW_SKILLS_CMD) : ["npx", "-y", "skills"];
}

/**
 * @param {string[]} args
 * @param {{ cwd: string, dryRun?: boolean }} options
 */
function runSkills(args, { cwd, dryRun }) {
	const argv = [...skillsCommand(), ...args];
	console.log(`${dryRun ? "would run" : "run"}: ${argv.join(" ")}`);
	if (dryRun) return 0;
	const result = runTool(argv, { cwd, inherit: true });
	if (result.error) throw new Error(`cannot run ${argv[0]}: ${result.error.message}`);
	return result.status ?? 1;
}

/**
 * One `skills add` per source. Every source runs even when one fails; the
 * failures are listed at the end.
 * @param {Map<string, Iterable<string>>} skills
 * @param {{ cwd: string, dryRun?: boolean, global?: boolean }} options
 */
function installBySource(skills, { cwd, dryRun, global }) {
	const failed = [];
	for (const [source, names] of skills) {
		// --full-depth: some sources keep skills below a root SKILL.md, and the
		// CLI stops there without it (cursor/plugins is one).
		const args = ["add", source, ...[...names].flatMap((name) => ["-s", name]), "-y", "--full-depth"];
		if (global) args.push("-g");
		if (runSkills(args, { cwd, dryRun }) !== 0) failed.push(source);
	}
	for (const source of failed) console.error(`failed: skills add ${source}`);
	return failed.length === 0 ? 0 : 1;
}

/**
 * Global skills on this machine, grouped by source, from the skills CLI lock.
 * Entries with no source are skipped.
 * @param {string} homeDir
 */
export function snapshotGlobalSkills(homeDir) {
	const lock = readJsonIfExists(path.join(homeDir, GLOBAL_LOCK), { skills: {} });
	/** @type {Record<string, string[]>} */
	const bySource = {};
	const skipped = [];
	for (const [name, entry] of Object.entries(isPlainObject(lock?.skills) ? lock.skills : {}).sort()) {
		if (!entry?.source) {
			skipped.push(name);
			continue;
		}
		bySource[entry.source] = [...(bySource[entry.source] ?? []), name];
	}
	return { skills: Object.fromEntries(Object.entries(bySource).sort()), skipped };
}

/** @param {Map<string, Iterable<string>>} skills */
const formatSkills = (skills) => [...skills].map(([source, names]) => `  ${source}: ${[...names].join(", ")}`);

/**
 * `ai-flow skills <sub>`.
 * @param {{ args: string[], dir: string, dryRun?: boolean, home?: string, file?: string, out?: string }} options
 */
export function handleSkills(options) {
	const sub = options.args[1] ?? "list";
	const homeDir = options.home ?? os.homedir();
	const manifest = options.file ?? path.join(ROOT, "machine", "global-skills.json");

	if (sub === "global") {
		if (!existsSync(manifest)) {
			throw new Error(
				`no global skills manifest at ${manifest}. Create your own and point --file at it; see README, "A new machine".`,
			);
		}
		const names = options.args.slice(2);
		const all = mergeSkillMaps(readJsonIfExists(manifest, {}).skills);
		if (names.length > 0) {
			const known = new Set([...all.values()].flatMap((set) => [...set]));
			const unknown = names.filter((name) => !known.has(name));
			if (unknown.length > 0) throw new Error(`not in ${manifest}: ${unknown.join(", ")}`);
			for (const [source, set] of all) {
				for (const name of set) if (!names.includes(name)) set.delete(name);
				if (set.size === 0) all.delete(source);
			}
		}
		return installBySource(all, { cwd: homeDir, dryRun: options.dryRun, global: true });
	}

	if (sub === "snapshot") {
		const { skills, skipped } = snapshotGlobalSkills(homeDir);
		for (const name of skipped) console.warn(`warning: ${name} has no source in ~/${GLOBAL_LOCK}; skipped.`);
		const snapshot = {
			$comment:
				"Global skills for a new machine: ai-flow skills global. Refresh with ai-flow skills snapshot --out <this file>.",
			skills,
		};
		const text = `${JSON.stringify(snapshot, null, "\t")}\n`;
		if (options.out) {
			writeFileSync(options.out, text);
			console.log(`wrote: ${options.out}`);
		} else {
			process.stdout.write(text);
		}
		return 0;
	}

	const { config, file: configPath } = readConfig(options.dir);
	const lockPath = path.join(options.dir, SKILLS_LOCK);

	if (sub === "add") {
		const [source, ...names] = options.args.slice(2);
		if (!source || names.length === 0) throw new Error("usage: ai-flow skills add <owner/repo> <skill...>");
		if (!SKILL_SOURCE.test(source)) throw new Error(`"${source}" is not an <owner>/<repo> source.`);
		checkSkillNames(names);
		const status = installBySource(new Map([[source, names]]), { cwd: options.dir, dryRun: options.dryRun });
		if (options.dryRun) return status;
		if (status !== 0) {
			console.error(`${CONFIG_FILE} unchanged: the skills CLI failed.`);
			return status;
		}
		const merged = mergeSkillMaps(config.skills, { [source]: names });
		config.skills = Object.fromEntries([...merged].map(([key, set]) => [key, [...set]]));
		config.disabledSkills = (config.disabledSkills ?? []).filter((/** @type {string} */ name) => !names.includes(name));
		writeConfig(configPath, config);
		return 0;
	}

	if (sub === "remove") {
		const names = options.args.slice(2);
		if (names.length === 0) throw new Error("usage: ai-flow skills remove <skill...>");
		checkSkillNames(names);
		const status = runSkills(["remove", ...names.flatMap((name) => ["-s", name]), "-y"], {
			cwd: options.dir,
			dryRun: options.dryRun,
		});
		if (options.dryRun) return status;
		// Disabling is the point even when the skill was never installed, so
		// the config changes whatever the CLI returned.
		if (status !== 0) console.warn("warning: the skills CLI failed; the skills are disabled in the config anyway.");
		config.disabledSkills = [...new Set([...(config.disabledSkills ?? []), ...names])];
		writeConfig(configPath, config);
		return 0;
	}

	const extra = config.extends === undefined ? [] : Array.isArray(config.extends) ? config.extends : [config.extends];
	const { skills } = resolveSkills(layersFor(config.preset, extra), config);

	if (sub === "install") {
		const { missing } = skillLockStatus(skills, lockPath);
		if (missing.size === 0) {
			console.log(`All skills are in ${SKILLS_LOCK}. On a fresh clone run \`ai-flow skills restore\`.`);
			return 0;
		}
		return installBySource(missing, { cwd: options.dir, dryRun: options.dryRun });
	}

	if (sub === "restore") {
		if (!existsSync(lockPath)) throw new Error(`${SKILLS_LOCK} not found. Run \`ai-flow skills install\` first.`);
		return runSkills(["experimental_install", "-y"], { cwd: options.dir, dryRun: options.dryRun });
	}

	if (sub === "list") {
		const { missing, mismatched } = skillLockStatus(skills, lockPath);
		console.log("Project skills (core + preset + .ai-flow.json):");
		for (const line of formatSkills(skills)) console.log(line);
		if (missing.size === 0 && mismatched.length === 0) {
			console.log(`\nAll are in ${SKILLS_LOCK}.`);
		}
		if (missing.size > 0) {
			console.log(`\nNot in ${SKILLS_LOCK} yet (run ai-flow skills install):\n${formatSkills(missing).join("\n")}`);
		}
		for (const { name, expected, actual } of mismatched) {
			console.log(`\n${name} is locked from ${actual}, not ${expected}.`);
		}
		return 0;
	}

	throw new Error(`Unknown skills command: ${sub}`);
}
