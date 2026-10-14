#!/usr/bin/env node
// ai-flow: sync the shared AI development cycle into a project repository.
//
// Layers, applied in order: core/, then each preset in the `extends` graph,
// then the project's own `.ai-flow.json` vars. Inside each layer:
//   managed/  overwritten on every sync (the project must not edit these)
//   seed/     written once, when missing (the project owns them after)
//   blocks/   marker blocks rewritten inside CLAUDE.md
// Third-party skills are not copied: each layer's skills.json names them by
// source, and the `skills` CLI (npx skills) installs and locks them.
// Text in every file is rendered with `@@dotted.var@@` placeholders. The
// delimiter is deliberately not `{{ }}`, which GitHub Actions uses.

import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_FILE, newConfig, writeConfig } from "../lib/config.mjs";
import { unifiedDiff } from "../lib/diff.mjs";
import { doctor } from "../lib/doctor.mjs";
import { isMixin, listPresets, parentsOf, presetChain } from "../lib/layers.mjs";
import { resolvePlan } from "../lib/plan.mjs";
import { LOCK_FILE, reconcile, toolVersion } from "../lib/reconcile.mjs";
import { GLOBAL_LOCK, handleSkills, SKILLS_LOCK } from "../lib/skills.mjs";
import { errorMessage, isPlainObject, readJson } from "../lib/util.mjs";

export { applyBlocks, render } from "../lib/render.mjs";
export { deepMerge } from "../lib/util.mjs";
export { reconcile, resolvePlan };

const VALUE_OPTIONS = new Map([
	["--preset", "preset"],
	["--dir", "dir"],
	["--home", "home"],
	["--file", "file"],
	["--out", "out"],
]);
const FLAG_OPTIONS = new Map([
	["--dry-run", "dryRun"],
	["--strict", "strict"],
	["--json", "json"],
	["--force", "force"],
	["--help", "help"],
	["-h", "help"],
	["--version", "version"],
	["-v", "version"],
]);
const PATH_OPTIONS = new Set(["dir", "home", "file", "out"]);

/**
 * @param {string[]} argv
 * @returns {Record<string, any> & { dir: string, args: string[], command?: string }}
 */
export function parseArgs(argv) {
	/** @type {Record<string, any> & { dir: string, args: string[], command?: string }} */
	const options = { dir: process.cwd(), args: [] };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const valueKey = VALUE_OPTIONS.get(arg);
		if (valueKey) {
			const value = argv[index + 1];
			if (value === undefined || value.startsWith("-")) throw new Error(`${arg} needs a value.`);
			options[valueKey] = PATH_OPTIONS.has(valueKey) ? path.resolve(value) : value;
			index += 1;
		} else if (FLAG_OPTIONS.has(arg)) {
			options[/** @type {string} */ (FLAG_OPTIONS.get(arg))] = true;
		} else if (arg.startsWith("-")) {
			throw new Error(`Unknown option: ${arg}. Run \`ai-flow --help\`.`);
		} else {
			options.args.push(arg);
		}
	}
	options.command = options.args[0];
	return options;
}

/**
 * @param {ReturnType<typeof reconcile>} result
 * @param {{ dryRun?: boolean }} options
 */
function printReport({ report }, { dryRun }) {
	if (dryRun) {
		for (const line of report.drift) {
			// Sync never installs skills, so do not say it would.
			if (line.startsWith("skill")) console.warn(`warning: ${line}`);
			else console.log(`would write: ${line}`);
		}
	} else {
		for (const rel of report.created) console.log(`created: ${rel}`);
		for (const rel of report.updated) console.log(`updated: ${rel}`);
		for (const rel of report.removed) console.log(`removed: ${rel}`);
		for (const line of report.drift) if (line.startsWith("skill")) console.warn(`warning: ${line}`);
	}
	for (const warning of report.warnings) console.warn(`warning: ${warning}`);
	if (report.drift.length === 0) console.log("Up to date.");
}

const USAGE = `Usage: ai-flow <command> [options]

Commands:
  init --preset <name> [--force]    Write ${CONFIG_FILE}, then sync. --force changes the preset of an existing config.
  sync [--dry-run]                  Update managed files and CLAUDE.md blocks, create missing seeds,
                                    remove files no longer managed, write ${LOCK_FILE}.
  check [--strict] [--json]         Exit 1 on drift (files, blocks, lock, skills). --strict also fails on warnings.
  diff                              Show what sync would change, as a unified diff.
  doctor                            Check the GitHub setup with gh: branches, required checks, merge methods, secrets.
  presets                           List the presets and mixins.
  roles                             List the roles this project syncs, with model and tools.
  vars                              Print the resolved template vars.

Skills (third-party skills install through the \`skills\` CLI and ${SKILLS_LOCK}):
  skills [list]                     Project skills by source, and which are not locked yet.
  skills install [--dry-run]        Install project skills missing from ${SKILLS_LOCK}.
  skills restore                    Fresh clone: restore every skill in ${SKILLS_LOCK}.
  skills add <owner/repo> <skill...>  Install skills, then add them to ${CONFIG_FILE}.
  skills remove <skill...>          Uninstall skills and disable them in ${CONFIG_FILE}.
  skills global [skill...]          New machine: install machine/global-skills.json globally.
  skills snapshot [--out <file>]    Write this machine's global skills (from ~/${GLOBAL_LOCK}).

Options:
  --dir <path>                      Project directory (default: current directory).
  --home <path>                     Home directory for global skills (default: your home).
  --file <path>                     Global skills manifest (default: machine/global-skills.json).
  --dry-run                         Print what would change; write nothing.
  -h, --help                        Show this help.
  -v, --version                     Print the ai-devflow-core version.

Environment:
  AI_FLOW_SKILLS_CMD                Replaces \`npx -y skills\` (JSON array or quoted command line).
  AI_FLOW_GH_CMD                    Replaces \`gh\` for doctor.
  AI_FLOW_NO_SYMLINK=1              Write AGENTS.md/GEMINI.md as copies instead of symlinks.`;

/** @param {Record<string, any> & { dir: string, args: string[], command?: string }} options */
function init(options) {
	const configPath = path.join(options.dir, CONFIG_FILE);
	if (!options.preset) throw new Error("init needs --preset <name>. Run `ai-flow presets` to list them.");
	presetChain(options.preset);
	if (isMixin(options.preset)) {
		throw new Error(`"${options.preset}" is a mixin: extend it from a preset instead of using it directly.`);
	}
	if (existsSync(configPath)) {
		if (!options.force)
			throw new Error(`${CONFIG_FILE} already exists. Edit it, or run init --force to change the preset.`);
		// --force is how a broken config gets replaced, so a config that does
		// not validate keeps its keys when it is an object, and is rewritten
		// from scratch when it is not.
		let config;
		try {
			config = readJson(configPath);
		} catch (error) {
			console.warn(`warning: ${errorMessage(error)}; writing a new ${CONFIG_FILE}.`);
		}
		if (!isPlainObject(config)) config = newConfig(options.preset);
		config.preset = options.preset;
		writeConfig(configPath, config);
		console.log(`updated: ${CONFIG_FILE} (preset ${options.preset})`);
	} else {
		writeConfig(configPath, newConfig(options.preset));
		console.log(`created: ${CONFIG_FILE}`);
	}
	printReport(reconcile(options.dir, { write: true }), {});
	return 0;
}

/** @param {Record<string, any> & { dir: string, args: string[], command?: string }} options */
function check(options) {
	const { report } = reconcile(options.dir, { write: false });
	const failed = report.drift.length > 0 || (options.strict && report.warnings.length > 0);
	if (options.json) {
		console.log(JSON.stringify({ ok: !failed, drift: report.drift, warnings: report.warnings }, null, 2));
	} else {
		for (const line of report.drift) console.log(`drift: ${line}`);
		for (const warning of report.warnings) console.warn(`warning: ${warning}`);
		if (report.drift.length === 0) console.log("No drift.");
	}
	return failed ? 1 : 0;
}

/** @param {Record<string, any> & { dir: string, args: string[], command?: string }} options */
export function main(options) {
	if (options.version) {
		console.log(toolVersion());
		return 0;
	}
	if (options.help) {
		console.log(USAGE);
		return 0;
	}
	switch (options.command) {
		case "init":
			return init(options);
		case "sync":
			printReport(reconcile(options.dir, { write: !options.dryRun }), { dryRun: options.dryRun });
			return 0;
		case "check":
			return check(options);
		case "diff": {
			const { report } = reconcile(options.dir, { write: false });
			for (const { rel, before, after } of report.diffs) {
				console.log(
					unifiedDiff(before, after, before === "" ? "/dev/null" : `a/${rel}`, after === "" ? "/dev/null" : `b/${rel}`),
				);
			}
			for (const line of report.drift) if (line.startsWith("skill")) console.warn(`warning: ${line}`);
			if (report.diffs.length === 0) console.log("No file changes.");
			return 0;
		}
		case "doctor": {
			const results = doctor(options.dir);
			const labels = { ok: "ok", warn: "warning", fail: "fail" };
			for (const { level, message } of results) {
				(level === "ok" ? console.log : console.warn)(`${labels[level]}: ${message}`);
			}
			return results.some((result) => result.level === "fail") ? 1 : 0;
		}
		case "presets": {
			const presets = listPresets();
			for (const mixins of [false, true]) {
				const group = presets.filter((preset) => Boolean(preset.mixin) === mixins);
				if (group.length === 0) continue;
				if (mixins) console.log("\nMixins (extend them from a preset):");
				for (const preset of group) {
					const parents = parentsOf(preset);
					const parent = parents.length > 0 ? ` (extends ${parents.join(", ")})` : "";
					console.log(`${preset.name}${parent}: ${preset.description}`);
				}
			}
			return 0;
		}
		case "roles":
			for (const role of resolvePlan(options.dir).roles) {
				console.log(`${role.name} (${role.model}): ${role.tools.join(", ")}`);
			}
			return 0;
		case "vars":
			console.log(JSON.stringify(resolvePlan(options.dir).vars, null, 2));
			return 0;
		case "skills":
			return handleSkills(options);
		case "help":
		case undefined:
			console.log(USAGE);
			return 0;
		default:
			console.error(`ai-flow: unknown command "${options.command}".\n`);
			console.log(USAGE);
			return 1;
	}
}

// `npx` runs the bin through a node_modules/.bin symlink, so compare real paths.
const invokedDirectly =
	process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
	try {
		process.exitCode = main(parseArgs(process.argv.slice(2)));
	} catch (error) {
		console.error(`ai-flow: ${errorMessage(error)}`);
		process.exitCode = 1;
	}
}
