#!/usr/bin/env node
// ai-flow: sync the shared AI development cycle into a project repository.
//
// Layers, applied in order: core/, then each preset in the `extends` chain,
// then the project's own `.ai-flow.json` vars. Inside each layer:
//   managed/  overwritten on every sync (the project must not edit these)
//   seed/     written once, only when missing (the project owns them after)
//   blocks/   marker blocks rewritten inside CLAUDE.md
// Third-party skills are not copied: each layer's skills.json names them by
// source, and the `skills` CLI (npx skills) installs and locks them.
// Text in every file is rendered with `@@dotted.var@@` placeholders. The
// delimiter is deliberately not `{{ }}`, which GitHub Actions uses.

import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_FILE = ".ai-flow.json";
const INSTRUCTIONS_FILE = "CLAUDE.md";
const INSTRUCTION_LINKS = ["AGENTS.md", "GEMINI.md"];
const BLOCK_NAMES = ["shared-core", "stack-preset"];
const PLACEHOLDER = /@@([A-Za-z0-9_.-]+)@@/g;

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const readJsonIfExists = (file, fallback) =>
	existsSync(file) ? readJson(file) : fallback;

function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function deepMerge(base, override) {
	if (!isPlainObject(base) || !isPlainObject(override)) return override;
	const merged = { ...base };
	for (const [key, value] of Object.entries(override)) {
		merged[key] = key in base ? deepMerge(base[key], value) : value;
	}
	return merged;
}

function lookup(vars, dottedKey) {
	return dottedKey
		.split(".")
		.reduce((node, key) => (isPlainObject(node) ? node[key] : undefined), vars);
}

export function render(text, vars, sourceLabel) {
	const missing = new Set();
	const output = text.replace(PLACEHOLDER, (match, key, offset) => {
		const value = lookup(vars, key);
		if (value === undefined || isPlainObject(value)) {
			missing.add(key);
			return match;
		}
		// A placeholder alone on an indented line (a list item inside a list)
		// keeps that indentation on every line of a multi-line value.
		const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
		const indent = text.slice(lineStart, offset);
		const lines = String(value).split("\n");
		return /^[ \t]*$/.test(indent) ? lines.join(`\n${indent}`) : lines.join("\n");
	});
	if (missing.size > 0) {
		throw new Error(
			`${sourceLabel}: unknown var(s) ${[...missing].join(", ")}. Define them in the preset or in ${CONFIG_FILE} "vars".`,
		);
	}
	return output;
}

function walk(dir, prefix = "") {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		return entry.isDirectory()
			? walk(path.join(dir, entry.name), rel)
			: [rel];
	});
}

export function listPresets() {
	const presetsDir = path.join(ROOT, "presets");
	return readdirSync(presetsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const meta = readJson(path.join(presetsDir, entry.name, "preset.json"));
			return { name: entry.name, ...meta };
		});
}

function presetChain(name, seen = []) {
	if (seen.includes(name)) {
		throw new Error(`Preset cycle: ${[...seen, name].join(" -> ")}`);
	}
	const dir = path.join(ROOT, "presets", name);
	if (!existsSync(path.join(dir, "preset.json"))) {
		const known = listPresets()
			.map((preset) => preset.name)
			.join(", ");
		throw new Error(`Unknown preset "${name}". Known presets: ${known}`);
	}
	const meta = readJson(path.join(dir, "preset.json"));
	const parents = meta.extends ? presetChain(meta.extends, [...seen, name]) : [];
	return [...parents, dir];
}

// Union of what every preset in the chain needs from package.json.
function mergeRequires(layers) {
	const requires = { packageScripts: new Set(), devDependencies: new Set() };
	for (const layer of layers) {
		const meta = readJsonIfExists(path.join(layer, "preset.json"), {});
		for (const key of Object.keys(requires)) {
			for (const item of meta.requires?.[key] ?? []) requires[key].add(item);
		}
	}
	return requires;
}

function mergeRoles(layers) {
	const roles = new Map();
	for (const layer of layers) {
		for (const role of readJsonIfExists(path.join(layer, "roles.json"), [])) {
			roles.set(role.name, { ...roles.get(role.name), ...role });
		}
	}
	return roles;
}

function wrapperFor(role) {
	return `---
name: ${role.name}
description: ${JSON.stringify(role.description)}
model: ${role.model}
tools: ${role.tools.join(", ")}
---

You are the **${role.name}** role in this repository's development cycle.

Before anything else, read these files and follow them exactly:

1. \`ai/agents/README.md\` — shared rules and the \`HANDOFF\` block format.
2. \`ai/agents/${role.name}.md\` — your role brief. It is the source of truth.

\`${INSTRUCTIONS_FILE}\` wins over the brief on conflict. Work in the directory the
caller gives you (a worktree path when one is given). End your reply with the
\`HANDOFF\` block.
`;
}

const MANAGED_NOTE =
	"Managed by ai-devflow-core: edit upstream, then run `ai-flow sync`.";

// Marks generated files so nobody edits them in place. JSON has no comments
// and files with front matter must start with `---`, so those get a note after
// the front matter or none at all.
function withManagedNote(rel, text) {
	if (rel.endsWith(".md")) {
		const note = `<!-- ${MANAGED_NOTE} -->\n`;
		if (!text.startsWith("---\n")) return note + text;
		const end = text.indexOf("\n---\n", 4);
		if (end === -1) return text;
		const cut = end + "\n---\n".length;
		return `${text.slice(0, cut)}${note}${text.slice(cut)}`;
	}
	if (/\.(ya?ml|sh)$/.test(rel) || rel.startsWith(".husky/")) {
		const lines = text.split("\n");
		const keepFirst = lines[0].startsWith("#!");
		const head = keepFirst ? [lines[0]] : [];
		const rest = keepFirst ? lines.slice(1) : lines;
		return [...head, `# ${MANAGED_NOTE}`, ...rest].join("\n");
	}
	return text;
}

export function resolvePlan(projectDir) {
	const configPath = path.join(projectDir, CONFIG_FILE);
	if (!existsSync(configPath)) {
		throw new Error(
			`${CONFIG_FILE} not found in ${projectDir}. Run \`ai-flow init --preset <name>\` first.`,
		);
	}
	const config = readJson(configPath);
	const layers = [path.join(ROOT, "core"), ...presetChain(config.preset)];
	const vars = layers
		.map((layer) => readJsonIfExists(path.join(layer, "vars.json"), {}))
		.reduce(deepMerge, {});
	const resolvedVars = deepMerge(vars, config.vars ?? {});
	const disabled = new Set(config.disabledRoles ?? []);
	const roles = mergeRoles(layers);

	const isDisabledBrief = (rel) => {
		const match = /^ai\/agents\/([^/]+)\.md$/.exec(rel);
		return match !== null && disabled.has(match[1]);
	};

	const collect = (kind) => {
		const files = new Map();
		for (const layer of layers) {
			for (const rel of walk(path.join(layer, kind))) {
				if (isDisabledBrief(rel)) continue;
				files.set(rel, path.join(layer, kind, rel));
			}
		}
		const rendered = new Map();
		for (const [rel, source] of files) {
			const label = path.relative(ROOT, source);
			rendered.set(rel, render(readFileSync(source, "utf8"), resolvedVars, label));
		}
		return rendered;
	};

	const managed = collect("managed");
	for (const [rel, text] of managed) managed.set(rel, withManagedNote(rel, text));

	// A role gets a Claude Code wrapper only when its brief is synced.
	for (const role of roles.values()) {
		if (managed.has(`ai/agents/${role.name}.md`)) {
			managed.set(
				`.claude/agents/${role.name}.md`,
				withManagedNote(`.claude/agents/${role.name}.md`, wrapperFor(role)),
			);
		}
	}

	const links = new Map(INSTRUCTION_LINKS.map((link) => [link, INSTRUCTIONS_FILE]));
	const skills = resolveSkills(layers, config);

	const blocks = {};
	for (const name of BLOCK_NAMES) {
		const parts = layers
			.map((layer) => path.join(layer, "blocks", `${name}.md`))
			.filter(existsSync)
			.map((file) =>
				render(readFileSync(file, "utf8"), resolvedVars, path.relative(ROOT, file)).trim(),
			);
		blocks[name] = parts.join("\n\n");
	}

	return {
		config,
		vars: resolvedVars,
		managed,
		seed: collect("seed"),
		blocks,
		links,
		requires: mergeRequires(layers),
		roles: [...roles.keys()].filter((name) => managed.has(`ai/agents/${name}.md`)),
		skills,
	};
}

export function applyBlocks(text, blocks) {
	let output = text;
	const missing = [];
	for (const [name, body] of Object.entries(blocks)) {
		const start = `<!-- ai-flow:${name}:start -->`;
		const end = `<!-- ai-flow:${name}:end -->`;
		const from = output.indexOf(start);
		const to = output.indexOf(end);
		if (from === -1 || to === -1 || to < from) {
			missing.push(name);
			continue;
		}
		const inner = `\n<!-- ${MANAGED_NOTE} -->\n${body}\n`;
		output = output.slice(0, from + start.length) + inner + output.slice(to);
	}
	return { text: output, missing };
}

const isExecutable = (rel) => rel.startsWith(".husky/") || rel.endsWith(".sh");

function writeFile(projectDir, rel, text) {
	const target = path.join(projectDir, rel);
	mkdirSync(path.dirname(target), { recursive: true });
	writeFileSync(target, text);
	if (isExecutable(rel)) chmodSync(target, 0o755);
}

function linkState(projectDir, link, expectedTarget) {
	const target = path.join(projectDir, link);
	if (!existsSync(target) && !isSymlink(target)) return "missing";
	if (isSymlink(target) && readlinkSync(target) === expectedTarget) return "ok";
	return "foreign";
}

function isSymlink(file) {
	try {
		return lstatSync(file).isSymbolicLink();
	} catch {
		return false;
	}
}

// Compares the plan with the project. `write` applies it; otherwise it only
// reports. Returns drift entries for `check`.
export function reconcile(projectDir, { write }) {
	const plan = resolvePlan(projectDir);
	const report = { created: [], updated: [], drift: [], warnings: [] };
	const read = (rel) => {
		const file = path.join(projectDir, rel);
		return existsSync(file) ? readFileSync(file, "utf8") : null;
	};

	for (const [rel, text] of plan.managed) {
		const current = read(rel);
		if (current === text) continue;
		report.drift.push(`${current === null ? "missing" : "modified"}: ${rel}`);
		if (write) {
			writeFile(projectDir, rel, text);
			(current === null ? report.created : report.updated).push(rel);
		}
	}

	for (const [rel, text] of plan.seed) {
		if (read(rel) !== null || plan.managed.has(rel)) continue;
		report.drift.push(`missing seed: ${rel}`);
		if (write) {
			writeFile(projectDir, rel, text);
			report.created.push(rel);
		}
	}

	const instructions = read(INSTRUCTIONS_FILE);
	if (instructions !== null) {
		const { text, missing } = applyBlocks(instructions, plan.blocks);
		for (const name of missing) {
			report.warnings.push(
				`${INSTRUCTIONS_FILE} has no ai-flow:${name} markers; add <!-- ai-flow:${name}:start --> and <!-- ai-flow:${name}:end --> where the block belongs.`,
			);
		}
		if (text !== instructions) {
			report.drift.push(`modified block: ${INSTRUCTIONS_FILE}`);
			if (write) {
				writeFile(projectDir, INSTRUCTIONS_FILE, text);
				report.updated.push(INSTRUCTIONS_FILE);
			}
		}
	}

	// package.json is the project's; report what the preset needs, never edit it.
	const pkgText = read("package.json");
	if (pkgText !== null) {
		const pkg = JSON.parse(pkgText);
		const deps = { ...pkg.dependencies, ...pkg.devDependencies };
		for (const script of plan.requires.packageScripts) {
			if (!pkg.scripts?.[script]) {
				report.warnings.push(`package.json has no "${script}" script; the cycle runs it.`);
			}
		}
		for (const dep of plan.requires.devDependencies) {
			if (!deps[dep]) report.warnings.push(`package.json does not depend on ${dep}.`);
		}
	}

	for (const [link, expectedTarget] of plan.links) {
		const state = linkState(projectDir, link, expectedTarget);
		if (state === "ok") continue;
		if (state === "foreign") {
			report.warnings.push(
				`${link} exists and is not a symlink to ${expectedTarget}.`,
			);
			continue;
		}
		report.drift.push(`missing symlink: ${link} -> ${expectedTarget}`);
		if (write) {
			const linkPath = path.join(projectDir, link);
			mkdirSync(path.dirname(linkPath), { recursive: true });
			symlinkSync(expectedTarget, linkPath, "dir");
			report.created.push(`${link} -> ${expectedTarget}`);
		}
	}

	for (const [source, names] of missingSkills(plan.skills, path.join(projectDir, LOCK_FILE))) {
		report.drift.push(`skills not in ${LOCK_FILE}: ${names.join(", ")} (${source}); run ai-flow skills install`);
	}

	return { plan, report };
}

// Skills by source: `{ "<owner>/<repo>": ["skill", ...] }`. Layers merge in
// order, then the project's `skills` adds and `disabledSkills` removes.
export function mergeSkillMaps(...maps) {
	const merged = new Map();
	for (const map of maps) {
		for (const [source, names] of Object.entries(map ?? {})) {
			if (source.startsWith("$")) continue;
			const set = merged.get(source) ?? new Set();
			for (const name of names) set.add(name);
			merged.set(source, set);
		}
	}
	return merged;
}

function resolveSkills(layers, config) {
	const merged = mergeSkillMaps(
		...layers.map((layer) => readJsonIfExists(path.join(layer, "skills.json"), {})),
		config.skills,
	);
	const disabled = new Set(config.disabledSkills ?? []);
	for (const [source, names] of merged) {
		for (const name of disabled) names.delete(name);
		if (names.size === 0) merged.delete(source);
	}
	return merged;
}

const LOCK_FILE = "skills-lock.json";
const GLOBAL_LOCK = path.join(".agents", ".skill-lock.json");

function lockedSkills(lockPath) {
	return new Set(Object.keys(readJsonIfExists(lockPath, { skills: {} }).skills ?? {}));
}

// Skills the lock file does not list yet, grouped by source.
export function missingSkills(skills, lockPath) {
	const locked = lockedSkills(lockPath);
	const missing = new Map();
	for (const [source, names] of skills) {
		const absent = [...names].filter((name) => !locked.has(name));
		if (absent.length > 0) missing.set(source, absent);
	}
	return missing;
}

// AI_FLOW_SKILLS_CMD swaps the `skills` CLI for a stub in tests.
function skillsCommand() {
	return (process.env.AI_FLOW_SKILLS_CMD ?? "npx -y skills").split(" ");
}

function runSkills(args, { cwd, dryRun }) {
	const [bin, ...base] = skillsCommand();
	const full = [...base, ...args];
	console.log(`${dryRun ? "would run" : "run"}: ${[bin, ...full].join(" ")}`);
	if (dryRun) return 0;
	const result = spawnSync(bin, full, { cwd, stdio: ["ignore", "inherit", "inherit"] });
	if (result.error) throw result.error;
	return result.status ?? 1;
}

function installBySource(skills, { cwd, dryRun, global }) {
	let status = 0;
	for (const [source, names] of skills) {
		// --full-depth: some sources keep skills below a root SKILL.md, and the
		// CLI stops there without it (cursor/plugins is one).
		const args = ["add", source, ...[...names].flatMap((name) => ["-s", name]), "-y", "--full-depth"];
		if (global) args.push("-g");
		status ||= runSkills(args, { cwd, dryRun });
	}
	return status;
}

// Global skills on this machine, grouped by source, from the skills CLI lock.
export function snapshotGlobalSkills(homeDir) {
	const lock = readJsonIfExists(path.join(homeDir, GLOBAL_LOCK), { skills: {} });
	const bySource = {};
	for (const [name, entry] of Object.entries(lock.skills ?? {}).sort()) {
		(bySource[entry.source] ??= []).push(name);
	}
	return Object.fromEntries(Object.entries(bySource).sort());
}

function parseArgs(argv) {
	const options = { dir: process.cwd(), args: [] };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--preset") options.preset = argv[++index];
		else if (arg === "--dir") options.dir = path.resolve(argv[++index]);
		else if (arg === "--dry-run") options.dryRun = true;
		else if (arg === "--home") options.home = path.resolve(argv[++index]);
		else if (arg === "--file") options.file = path.resolve(argv[++index]);
		else if (arg === "--out") options.out = path.resolve(argv[++index]);
		else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
		else options.args.push(arg);
	}
	options.command = options.args[0];
	return options;
}

function printReport({ report }, { dryRun }) {
	const verb = dryRun ? "would write" : "wrote";
	if (dryRun) {
		for (const line of report.drift) console.log(`${verb}: ${line}`);
	} else {
		for (const rel of report.created) console.log(`created: ${rel}`);
		for (const rel of report.updated) console.log(`updated: ${rel}`);
	}
	if (!dryRun) {
		// Sync never installs skills; say what is still missing.
		for (const line of report.drift) if (line.startsWith("skills ")) console.warn(`warning: ${line}`);
	}
	for (const warning of report.warnings) console.warn(`warning: ${warning}`);
	if (report.drift.length === 0) console.log("Up to date.");
}

const USAGE = `Usage: ai-flow <command> [options]

Commands:
  init --preset <name>              Write ${CONFIG_FILE}, then sync.
  sync [--dry-run]                  Update managed files and CLAUDE.md blocks; create missing seeds.
  check                             Exit 1 when the project drifted (files, blocks, skills not locked).
  presets                           List the available presets.
  vars                              Print the resolved template vars.

Skills (third-party skills install through the \`skills\` CLI and ${LOCK_FILE}):
  skills [list]                     Project skills by source, and which are not locked yet.
  skills install [--dry-run]        Install project skills missing from ${LOCK_FILE}.
  skills restore                    Fresh clone: restore every skill in ${LOCK_FILE}.
  skills add <owner/repo> <skill...>  Add skills to ${CONFIG_FILE} and install them.
  skills remove <skill...>          Disable skills in ${CONFIG_FILE} and uninstall them.
  skills global [skill...]          New machine: install machine/global-skills.json globally.
  skills snapshot [--out <file>]    Write this machine's global skills (from ~/${GLOBAL_LOCK}).

Options:
  --dir <path>                      Project directory (default: current directory).
  --home <path>                     Home directory for global skills (default: your home).
  --file <path>                     Global skills manifest (default: machine/global-skills.json).`;

function formatSkills(skills) {
	return [...skills].map(([source, names]) => `  ${source}: ${[...names].join(", ")}`);
}

function handleSkills(options) {
	const sub = options.args[1] ?? "list";
	const configPath = path.join(options.dir, CONFIG_FILE);
	const homeDir = options.home ?? os.homedir();
	const manifest = options.file ?? path.join(ROOT, "machine", "global-skills.json");

	if (sub === "global") {
		const names = options.args.slice(2);
		const all = mergeSkillMaps(readJsonIfExists(manifest, {}).skills);
		if (names.length > 0) {
			for (const [source, set] of all) {
				for (const name of set) if (!names.includes(name)) set.delete(name);
				if (set.size === 0) all.delete(source);
			}
		}
		return installBySource(all, { cwd: homeDir, dryRun: options.dryRun, global: true });
	}

	if (sub === "snapshot") {
		const snapshot = {
			$comment:
				"Global skills for a new machine: ai-flow skills global. Refresh with ai-flow skills snapshot --out <this file>.",
			skills: snapshotGlobalSkills(homeDir),
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

	if (!existsSync(configPath)) throw new Error(`${CONFIG_FILE} not found. Run init first.`);
	const config = readJson(configPath);
	const saveConfig = () => writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`);
	const lockPath = path.join(options.dir, LOCK_FILE);

	if (sub === "add") {
		const [source, ...names] = options.args.slice(2);
		if (!source || names.length === 0) throw new Error("usage: ai-flow skills add <owner/repo> <skill...>");
		config.skills = Object.fromEntries(mergeSkillMaps(config.skills, { [source]: names }));
		for (const key of Object.keys(config.skills)) config.skills[key] = [...config.skills[key]];
		config.disabledSkills = (config.disabledSkills ?? []).filter((name) => !names.includes(name));
		saveConfig();
		return installBySource(new Map([[source, names]]), { cwd: options.dir, dryRun: options.dryRun });
	}

	if (sub === "remove") {
		const names = options.args.slice(2);
		if (names.length === 0) throw new Error("usage: ai-flow skills remove <skill...>");
		config.disabledSkills = [...new Set([...(config.disabledSkills ?? []), ...names])];
		saveConfig();
		return runSkills(["remove", ...names.flatMap((name) => ["-s", name]), "-y"], {
			cwd: options.dir,
			dryRun: options.dryRun,
		});
	}

	const skills = resolveSkills([path.join(ROOT, "core"), ...presetChain(config.preset)], config);

	if (sub === "install") {
		const missing = missingSkills(skills, lockPath);
		if (missing.size === 0) {
			console.log(`All skills are in ${LOCK_FILE}. On a fresh clone run \`ai-flow skills restore\`.`);
			return 0;
		}
		return installBySource(missing, { cwd: options.dir, dryRun: options.dryRun });
	}

	if (sub === "restore") {
		return runSkills(["experimental_install", "-y"], { cwd: options.dir, dryRun: options.dryRun });
	}

	if (sub === "list") {
		const missing = missingSkills(skills, lockPath);
		console.log("Project skills (core + preset + .ai-flow.json):");
		for (const line of formatSkills(skills)) console.log(line);
		console.log(
			missing.size === 0
				? `\nAll are in ${LOCK_FILE}.`
				: `\nNot in ${LOCK_FILE} yet (run ai-flow skills install):\n${formatSkills(missing).join("\n")}`,
		);
		return 0;
	}

	throw new Error(`Unknown skills command: ${sub}`);
}

function main(argv) {
	const options = parseArgs(argv);
	const configPath = path.join(options.dir, CONFIG_FILE);
	switch (options.command) {
		case "init": {
			if (!options.preset) throw new Error("init needs --preset <name>.");
			if (existsSync(configPath)) {
				throw new Error(`${CONFIG_FILE} already exists. Edit it and run \`ai-flow sync\`.`);
			}
			presetChain(options.preset);
			const config = {
				preset: options.preset,
				vars: {},
				disabledRoles: [],
				skills: {},
				disabledSkills: [],
			};
			writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`);
			console.log(`created: ${CONFIG_FILE}`);
			printReport(reconcile(options.dir, { write: true }), {});
			return 0;
		}
		case "sync":
			printReport(reconcile(options.dir, { write: !options.dryRun }), options);
			return 0;
		case "check": {
			const { report } = reconcile(options.dir, { write: false });
			for (const line of report.drift) console.log(`drift: ${line}`);
			for (const warning of report.warnings) console.warn(`warning: ${warning}`);
			if (report.drift.length === 0) console.log("No drift.");
			return report.drift.length === 0 ? 0 : 1;
		}
		case "presets":
			for (const preset of listPresets()) {
				const parent = preset.extends ? ` (extends ${preset.extends})` : "";
				console.log(`${preset.name}${parent}: ${preset.description}`);
			}
			return 0;
		case "skills":
			return handleSkills(options);
		case "vars":
			console.log(JSON.stringify(resolvePlan(options.dir).vars, null, 2));
			return 0;
		default:
			console.log(USAGE);
			return options.command ? 1 : 0;
	}
}

// `npx` runs the bin through a node_modules/.bin symlink, so compare real paths.
const invokedDirectly =
	process.argv[1] !== undefined &&
	realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
	try {
		process.exitCode = main(process.argv.slice(2));
	} catch (error) {
		console.error(`ai-flow: ${error.message}`);
		process.exitCode = 1;
	}
}
