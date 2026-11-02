// Layers: core/, then every preset in the `extends` graph, in order.
// Each layer may hold managed/, seed/, blocks/, vars.json, roles.json,
// skills.json, seeds.json and (presets only) preset.json.

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPlainObject, isStringArray, readJson, readJsonIfExists, SKILL_NAME, SKILL_SOURCE } from "./util.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRESETS_DIR = path.join(ROOT, "presets");
const PRESET_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** @param {string} name */
function readPresetMeta(name) {
	const file = path.join(PRESETS_DIR, name, "preset.json");
	return existsSync(file) ? readJson(file) : null;
}

/** @returns {{ name: string, description?: string, extends?: string | string[], mixin?: boolean }[]} */
export function listPresets() {
	return readdirSync(PRESETS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(path.join(PRESETS_DIR, entry.name, "preset.json")))
		.map((entry) => ({ name: entry.name, ...readPresetMeta(entry.name) }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** @param {any} meta */
export const parentsOf = (meta) =>
	meta.extends === undefined ? [] : Array.isArray(meta.extends) ? meta.extends : [meta.extends];

/**
 * Preset directories, parents first. `extends` takes a name or a list; a
 * preset reached twice (a diamond) is applied once, at its first position.
 * @param {string} name
 * @param {string[]} [stack]
 * @param {string[]} [out]
 * @returns {string[]}
 */
export function presetChain(name, stack = [], out = []) {
	if (typeof name !== "string" || !PRESET_NAME.test(name)) {
		throw new Error(`Invalid preset name ${JSON.stringify(name)}. Run \`ai-flow presets\` to list them.`);
	}
	if (stack.includes(name)) {
		throw new Error(`Preset cycle: ${[...stack, name].join(" -> ")}`);
	}
	const meta = readPresetMeta(name);
	if (!meta) {
		const known = listPresets()
			.map((preset) => preset.name)
			.join(", ");
		throw new Error(`Unknown preset "${name}". Known presets: ${known}`);
	}
	for (const parent of parentsOf(meta)) presetChain(parent, [...stack, name], out);
	const dir = path.join(PRESETS_DIR, name);
	if (!out.includes(dir)) out.push(dir);
	return out;
}

/** @param {string} preset */
export const layersFor = (preset, extra = []) => {
	const dirs = [path.join(ROOT, "core"), ...presetChain(preset)];
	for (const name of extra) {
		for (const dir of presetChain(name)) if (!dirs.includes(dir)) dirs.push(dir);
	}
	return dirs;
};

/** @param {string} preset */
export function isMixin(preset) {
	return readPresetMeta(preset)?.mixin === true;
}

const REQUIRE_KEYS = /** @type {const} */ (["packageScripts", "devDependencies", "checks", "secrets"]);

/**
 * Union of what every preset in the chain needs: package.json scripts and dev
 * dependencies, required status checks, repository secrets.
 * @param {string[]} layers
 */
export function mergeRequires(layers) {
	/** @type {Record<typeof REQUIRE_KEYS[number], Set<string>>} */
	const requires = {
		packageScripts: new Set(),
		devDependencies: new Set(),
		checks: new Set(),
		secrets: new Set(),
	};
	for (const layer of layers) {
		const meta = readJsonIfExists(path.join(layer, "preset.json"), {});
		for (const key of REQUIRE_KEYS) {
			for (const item of meta.requires?.[key] ?? []) requires[key].add(item);
		}
	}
	return requires;
}

/**
 * Roles by name. A later layer may override some fields of an earlier role.
 * @param {string[]} layers
 */
export function mergeRoles(layers) {
	/** @type {Map<string, any>} */
	const roles = new Map();
	for (const layer of layers) {
		const file = path.join(layer, "roles.json");
		const list = readJsonIfExists(file, []);
		if (!Array.isArray(list)) throw new Error(`${file}: must be an array of roles`);
		for (const role of list) {
			if (!isPlainObject(role) || typeof role.name !== "string" || !PRESET_NAME.test(role.name)) {
				throw new Error(`${file}: every role needs a "name" in kebab-case`);
			}
			roles.set(role.name, { ...roles.get(role.name), ...role });
		}
	}
	for (const role of roles.values()) {
		const problems = [];
		if (typeof role.model !== "string") problems.push('"model" (string)');
		if (typeof role.description !== "string") problems.push('"description" (string)');
		if (!isStringArray(role.tools)) problems.push('"tools" (array of strings)');
		if (problems.length > 0) {
			throw new Error(`role "${role.name}" is missing ${problems.join(", ")} in roles.json`);
		}
	}
	return roles;
}

/**
 * Skills by source: `{ "<owner>/<repo>": ["skill", ...] }`. Maps merge in
 * order; keys starting with `$` are comments.
 * @param {...any} maps
 * @returns {Map<string, Set<string>>}
 */
export function mergeSkillMaps(...maps) {
	const merged = new Map();
	for (const map of maps) {
		for (const [source, names] of Object.entries(map ?? {})) {
			if (source.startsWith("$")) continue;
			if (!SKILL_SOURCE.test(source)) throw new Error(`skills: "${source}" is not an <owner>/<repo> source`);
			if (!isStringArray(names)) throw new Error(`skills for "${source}" must be an array of names`);
			const bad = names.find((name) => !SKILL_NAME.test(name));
			if (bad !== undefined) throw new Error(`skills for "${source}": ${JSON.stringify(bad)} is not a skill name`);
			const set = merged.get(source) ?? new Set();
			for (const name of names) set.add(name);
			merged.set(source, set);
		}
	}
	return merged;
}

/**
 * Layer skills, then the project's `skills`, minus `disabledSkills`.
 * @param {string[]} layers
 * @param {any} config
 */
export function resolveSkills(layers, config) {
	const all = mergeSkillMaps(
		...layers.map((layer) => readJsonIfExists(path.join(layer, "skills.json"), {})),
		config.skills,
	);
	const disabled = new Set(config.disabledSkills ?? []);
	/** @type {Map<string, Set<string>>} */
	const skills = new Map();
	for (const [source, names] of all) {
		const kept = new Set([...names].filter((name) => !disabled.has(name)));
		if (kept.size > 0) skills.set(source, kept);
	}
	return { skills, all };
}

/**
 * Rules for seeds, from each layer's seeds.json:
 * `{ "<rel>": { "skipIf": [{ "exists": "<rel>" } | { "file": "<rel>", "contains": "<text>" }] } }`.
 * A seed whose rule matches is not created; this keeps a renamed or split seed
 * from duplicating what an existing project already has.
 * @param {string[]} layers
 * @returns {Record<string, any>}
 */
export function mergeSeedRules(layers) {
	/** @type {Record<string, any>} */
	const rules = {};
	for (const layer of layers) {
		const file = path.join(layer, "seeds.json");
		for (const [rel, rule] of Object.entries(readJsonIfExists(file, {}))) {
			if (rel.startsWith("$")) continue;
			if (!isPlainObject(rule) || !Array.isArray(rule.skipIf)) {
				throw new Error(`${file}: "${rel}" needs a "skipIf" array`);
			}
			rules[rel] = rule;
		}
	}
	return rules;
}
