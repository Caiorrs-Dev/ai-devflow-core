#!/usr/bin/env node
// ai-flow: sync the shared AI development cycle into a project repository.
//
// Layers, applied in order: core/, then each preset in the `extends` chain,
// then the project's own `.ai-flow.json` vars. Inside each layer:
//   managed/  overwritten on every sync (the project must not edit these)
//   seed/     written once, only when missing (the project owns them after)
//   skills/   tool-agnostic skills synced to .agents/skills/ & symlinked in .claude/skills/
//   blocks/   marker blocks rewritten inside CLAUDE.md
// Text in every file is rendered with `@@dotted.var@@` placeholders. The
// delimiter is deliberately not `{{ }}`, which GitHub Actions uses.

import {
	chmodSync,
	cpSync,
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

export function getAvailableSkills(layers = []) {
	const skills = new Map();
	const catalogDir = path.join(ROOT, "catalog", "skills");
	if (existsSync(catalogDir)) {
		for (const entry of readdirSync(catalogDir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				skills.set(entry.name, { sourceDir: path.join(catalogDir, entry.name), layer: "catalog" });
			}
		}
	}
	for (const layer of layers) {
		const skillsDir = path.join(layer, "skills");
		if (existsSync(skillsDir)) {
			const layerName = path.basename(layer);
			for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
				if (entry.isDirectory()) {
					skills.set(entry.name, { sourceDir: path.join(skillsDir, entry.name), layer: layerName });
				}
			}
		}
	}
	return skills;
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

	// Active skills: layers' skills + config.skills - config.disabledSkills
	const allAvailableSkills = getAvailableSkills(layers);
	const activeSkills = new Map();
	for (const layer of layers) {
		const skillsDir = path.join(layer, "skills");
		if (existsSync(skillsDir)) {
			for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
				if (entry.isDirectory()) {
					activeSkills.set(entry.name, path.join(skillsDir, entry.name));
				}
			}
		}
	}
	for (const name of config.skills ?? []) {
		if (allAvailableSkills.has(name)) {
			activeSkills.set(name, allAvailableSkills.get(name).sourceDir);
		}
	}
	for (const name of config.disabledSkills ?? []) {
		activeSkills.delete(name);
	}

	// Symlinks map: linkRel -> expectedTarget
	const links = new Map();
	for (const link of INSTRUCTION_LINKS) {
		links.set(link, INSTRUCTIONS_FILE);
	}

	// Sync skill files into .agents/skills/<name> and symlink into .claude/skills/<name>
	for (const [skillName, skillDir] of activeSkills) {
		for (const rel of walk(skillDir)) {
			const targetRel = `.agents/skills/${skillName}/${rel}`;
			const sourceFile = path.join(skillDir, rel);
			const label = path.relative(ROOT, sourceFile);
			const rendered = render(readFileSync(sourceFile, "utf8"), resolvedVars, label);
			managed.set(targetRel, withManagedNote(targetRel, rendered));
		}
		links.set(`.claude/skills/${skillName}`, `../../.agents/skills/${skillName}`);
	}

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
		skills: [...activeSkills.keys()],
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

	return { plan, report };
}

export function installGlobalSkills(skillNames, { homeDir = os.homedir() } = {}) {
	const allAvailable = getAvailableSkills([path.join(ROOT, "core")]);
	const agentsSkillsDir = path.join(homeDir, ".agents", "skills");
	const claudeSkillsDir = path.join(homeDir, ".claude", "skills");
	mkdirSync(agentsSkillsDir, { recursive: true });
	mkdirSync(claudeSkillsDir, { recursive: true });

	const installed = [];
	for (const name of skillNames) {
		const skill = allAvailable.get(name);
		if (!skill) {
			console.warn(`warning: skill "${name}" not found in catalog or core skills.`);
			continue;
		}
		const destDir = path.join(agentsSkillsDir, name);
		cpSync(skill.sourceDir, destDir, { recursive: true });

		const linkPath = path.join(claudeSkillsDir, name);
		const expectedTarget = `../../.agents/skills/${name}`;
		if (!existsSync(linkPath) && !isSymlink(linkPath)) {
			symlinkSync(expectedTarget, linkPath, "dir");
		}
		installed.push(name);
	}
	return installed;
}

function parseArgs(argv) {
	const options = { dir: process.cwd(), args: [] };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--preset") options.preset = argv[++index];
		else if (arg === "--dir") options.dir = path.resolve(argv[++index]);
		else if (arg === "--dry-run") options.dryRun = true;
		else if (arg === "--home") options.home = path.resolve(argv[++index]);
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
	for (const warning of report.warnings) console.warn(`warning: ${warning}`);
	if (report.drift.length === 0) console.log("Up to date.");
}

const USAGE = `Usage: ai-flow <command> [options]

Commands:
  init --preset <name>       Write ${CONFIG_FILE}, then sync.
  sync [--dry-run]            Update managed files, skills, CLAUDE.md blocks; create missing seeds.
  check                       Exit 1 when the project drifted from the framework.
  presets                     List the available presets.
  skills [list]               List active project skills and available catalog skills.
  skills add <name>           Add a skill from catalog/presets to project and sync.
  skills remove <name>        Disable a skill in project and sync.
  skills global [names...]    Install recommended skills into ~/.agents/skills and ~/.claude/skills.
  vars                        Print the resolved template vars.

Options:
  --dir <path>                Project directory (default: current directory).
  --home <path>               Target home directory for global skills (default: user home).`;

function handleSkills(options) {
	const sub = options.args[1];
	const configPath = path.join(options.dir, CONFIG_FILE);

	if (sub === "global") {
		const names = options.args.slice(2);
		let toInstall = names;
		if (toInstall.length === 0) {
			const config = existsSync(configPath) ? readJson(configPath) : {};
			toInstall = config.recommendedGlobalSkills ?? ["caveman"];
		}
		const installed = installGlobalSkills(toInstall, { homeDir: options.home });
		for (const name of installed) {
			console.log(`installed global skill: ${name} (~/.agents/skills/${name} -> ~/.claude/skills/${name})`);
		}
		return 0;
	}

	if (sub === "add") {
		const name = options.args[2];
		if (!name) throw new Error("skills add requires a skill name.");
		if (!existsSync(configPath)) throw new Error(`${CONFIG_FILE} not found. Run init first.`);
		const config = readJson(configPath);
		config.skills = [...new Set([...(config.skills ?? []), name])];
		config.disabledSkills = (config.disabledSkills ?? []).filter((s) => s !== name);
		writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`);
		console.log(`added skill "${name}" to ${CONFIG_FILE}`);
		printReport(reconcile(options.dir, { write: true }), {});
		return 0;
	}

	if (sub === "remove") {
		const name = options.args[2];
		if (!name) throw new Error("skills remove requires a skill name.");
		if (!existsSync(configPath)) throw new Error(`${CONFIG_FILE} not found. Run init first.`);
		const config = readJson(configPath);
		config.skills = (config.skills ?? []).filter((s) => s !== name);
		config.disabledSkills = [...new Set([...(config.disabledSkills ?? []), name])];
		writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`);
		console.log(`disabled skill "${name}" in ${CONFIG_FILE}`);
		printReport(reconcile(options.dir, { write: true }), {});
		return 0;
	}

	// Default: list skills
	const plan = existsSync(configPath) ? resolvePlan(options.dir) : null;
	const layers = plan ? [path.join(ROOT, "core"), ...presetChain(plan.config.preset)] : [path.join(ROOT, "core")];
	const available = getAvailableSkills(layers);

	console.log("Active project skills:");
	if (plan) {
		for (const name of plan.skills) console.log(`  - ${name}`);
	} else {
		console.log("  (no project initialized)");
	}

	console.log("\nAvailable catalog skills:");
	for (const [name, info] of available) {
		if (info.layer === "catalog") console.log(`  - ${name}`);
	}

	console.log("\nRecommended global skills:");
	const rec = plan?.config?.recommendedGlobalSkills ?? ["caveman"];
	for (const name of rec) console.log(`  - ${name}`);

	return 0;
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
				skills: [],
				recommendedGlobalSkills: ["caveman"],
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
