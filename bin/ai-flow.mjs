#!/usr/bin/env node
// ai-flow: sync the shared AI development cycle into a project repository.
//
// Layers, applied in order: core/, then each preset in the `extends` chain,
// then the project's own `.ai-flow.json` vars. Inside each layer:
//   managed/  overwritten on every sync (the project must not edit these)
//   seed/     written once, only when missing (the project owns them after)
//   blocks/   marker blocks rewritten inside CLAUDE.md
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
		requires: mergeRequires(layers),
		roles: [...roles.keys()].filter((name) => managed.has(`ai/agents/${name}.md`)),
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

function linkState(projectDir, link) {
	const target = path.join(projectDir, link);
	if (!existsSync(target) && !isSymlink(target)) return "missing";
	if (isSymlink(target) && readlinkSync(target) === INSTRUCTIONS_FILE) return "ok";
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

	for (const link of INSTRUCTION_LINKS) {
		const state = linkState(projectDir, link);
		if (state === "ok") continue;
		if (state === "foreign") {
			report.warnings.push(
				`${link} exists and is not a symlink to ${INSTRUCTIONS_FILE}; merge it into ${INSTRUCTIONS_FILE}, delete it, and sync again.`,
			);
			continue;
		}
		report.drift.push(`missing symlink: ${link} -> ${INSTRUCTIONS_FILE}`);
		if (write) {
			symlinkSync(INSTRUCTIONS_FILE, path.join(projectDir, link));
			report.created.push(`${link} -> ${INSTRUCTIONS_FILE}`);
		}
	}

	return { plan, report };
}

function parseArgs(argv) {
	const [command, ...rest] = argv;
	const options = { command, dir: process.cwd() };
	for (let index = 0; index < rest.length; index += 1) {
		const arg = rest[index];
		if (arg === "--preset") options.preset = rest[++index];
		else if (arg === "--dir") options.dir = path.resolve(rest[++index]);
		else if (arg === "--dry-run") options.dryRun = true;
		else throw new Error(`Unknown argument: ${arg}`);
	}
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
  init --preset <name>  Write ${CONFIG_FILE}, then sync.
  sync [--dry-run]      Update managed files and CLAUDE.md blocks; create missing seeds.
  check                 Exit 1 when the project drifted from the framework.
  presets               List the available presets.
  vars                  Print the resolved template vars.

Options:
  --dir <path>          Project directory (default: current directory).`;

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
			const config = { preset: options.preset, vars: {}, disabledRoles: [] };
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
