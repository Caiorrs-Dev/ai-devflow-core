// Resolves what a project should contain: rendered managed files, seeds,
// CLAUDE.md blocks, role wrappers, requirements and skills.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { readConfig } from "./config.mjs";
import { layersFor, mergeRequires, mergeRoles, mergeSeedRules, ROOT, resolveSkills } from "./layers.mjs";
import { lookup, render, withManagedNote } from "./render.mjs";
import { deepMerge, isStringArray, readJsonIfExists } from "./util.mjs";

export const INSTRUCTIONS_FILE = "CLAUDE.md";
export const INSTRUCTION_LINKS = ["AGENTS.md", "GEMINI.md"];
const BLOCK_NAMES = ["shared-core", "stack-preset"];

/**
 * @param {string} rel
 * @param {string} text
 * @param {string} label
 */
function checkRendered(rel, text, label) {
	if (!rel.endsWith(".json")) return;
	try {
		JSON.parse(text);
	} catch (error) {
		throw new Error(
			`${label}: renders to invalid JSON (${error instanceof Error ? error.message : error}). Check the vars it uses for quotes or newlines.`,
		);
	}
}

/**
 * @param {any} role
 * @param {string[]} extraTools
 */
function wrapperFor(role, extraTools) {
	const tools = [...new Set([...role.tools, ...extraTools])];
	return `---
name: ${role.name}
description: ${JSON.stringify(role.description)}
model: ${role.model}
tools: ${tools.join(", ")}
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

/**
 * Vars every layer can use: `project.*` from package.json, and the release
 * package name defaulting to it. Layers and `.ai-flow.json` override them.
 * @param {string} projectDir
 */
function derivedVars(projectDir) {
	const pkg = readJsonIfExists(path.join(projectDir, "package.json"), null);
	const name = typeof pkg?.name === "string" ? pkg.name : path.basename(path.resolve(projectDir));
	const version = typeof pkg?.version === "string" ? pkg.version : "0.1.0";
	return { project: { name, version }, release: { packageName: name } };
}

/** @param {string} projectDir */
export function resolvePlan(projectDir) {
	const { config, warnings } = readConfig(projectDir);
	const layers = layersFor(config.preset);
	const layerVars = layers
		.map((layer) => readJsonIfExists(path.join(layer, "vars.json"), {}))
		.reduce(deepMerge, derivedVars(projectDir));
	const vars = deepMerge(layerVars, config.vars ?? {});
	const disabledRoles = new Set(config.disabledRoles ?? []);
	const disabledFiles = new Set(config.disabledFiles ?? []);
	const roles = mergeRoles(layers);
	const extraTools = lookup(vars, "agents.extraTools") ?? [];
	if (!isStringArray(extraTools)) throw new Error('var "agents.extraTools" must be an array of tool names');

	for (const name of disabledRoles) {
		if (!roles.has(name)) warnings.push(`disabledRoles: no role "${name}" in this preset.`);
	}

	/** @param {string} rel */
	const isDisabledBrief = (rel) => {
		const match = /^ai\/agents\/([^/]+)\.md$/.exec(rel);
		return match !== null && disabledRoles.has(match[1]);
	};

	const knownFiles = new Set();
	/** @param {"managed" | "seed"} kind */
	const collect = (kind) => {
		const files = new Map();
		for (const layer of layers) {
			for (const rel of walk(path.join(layer, kind))) {
				knownFiles.add(rel);
				if (isDisabledBrief(rel) || disabledFiles.has(rel)) continue;
				files.set(rel, path.join(layer, kind, rel));
			}
		}
		/** @type {Map<string, string>} */
		const rendered = new Map();
		for (const [rel, source] of files) {
			const label = path.relative(ROOT, source);
			const text = render(readFileSync(source, "utf8"), vars, label);
			checkRendered(rel, text, label);
			rendered.set(rel, text);
		}
		return rendered;
	};

	const managed = collect("managed");
	for (const [rel, text] of managed) managed.set(rel, withManagedNote(rel, text));
	const seed = collect("seed");

	// A role gets a Claude Code wrapper only when its brief is synced.
	for (const role of roles.values()) {
		const rel = `.claude/agents/${role.name}.md`;
		knownFiles.add(rel);
		if (managed.has(`ai/agents/${role.name}.md`) && !disabledFiles.has(rel)) {
			managed.set(rel, withManagedNote(rel, wrapperFor(role, extraTools)));
		}
	}

	for (const rel of disabledFiles) {
		if (!knownFiles.has(rel)) warnings.push(`disabledFiles: "${rel}" is not a file this preset writes.`);
	}

	/** @type {Record<string, string>} */
	const blocks = {};
	for (const name of BLOCK_NAMES) {
		blocks[name] = layers
			.map((layer) => path.join(layer, "blocks", `${name}.md`))
			.filter((file) => existsSync(file))
			.map((file) => render(readFileSync(file, "utf8"), vars, path.relative(ROOT, file)).trim())
			.join("\n\n");
	}

	const { skills, all: allSkills } = resolveSkills(layers, config);
	const knownSkills = new Set([...allSkills.values()].flatMap((names) => [...names]));
	for (const name of config.disabledSkills ?? []) {
		if (!knownSkills.has(name)) warnings.push(`disabledSkills: no skill "${name}" in this preset or in "skills".`);
	}

	return {
		config,
		warnings,
		layers,
		vars,
		managed,
		seed,
		seedRules: mergeSeedRules(layers),
		blocks,
		requires: mergeRequires(layers),
		roles: [...roles.values()].filter((role) => managed.has(`ai/agents/${role.name}.md`)),
		skills,
	};
}

/**
 * Relative file paths under `dir`, with `/` separators on every platform.
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {string[]}
 */
function walk(dir, prefix = "") {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		return entry.isDirectory() ? walk(path.join(dir, entry.name), rel) : [rel];
	});
}
