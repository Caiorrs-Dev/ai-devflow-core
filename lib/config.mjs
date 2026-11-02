// The project's `.ai-flow.json`: read, validate, write.

import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listPresets } from "./layers.mjs";
import { isPlainObject, isStringArray, readJson, SKILL_NAME, SKILL_SOURCE } from "./util.mjs";

export const CONFIG_FILE = ".ai-flow.json";
export const SCHEMA_URL =
	"https://raw.githubusercontent.com/Caiorrs-Dev/ai-devflow-core/main/schema/ai-flow.schema.json";

const ARRAY_KEYS = ["disabledRoles", "disabledFiles", "disabledSkills", "localFiles"];
const KNOWN_KEYS = new Set(["$schema", "preset", "extends", "vars", "skills", "localFiles", ...ARRAY_KEYS]);

/**
 * Throws on a config that cannot work; returns warnings for keys it ignores.
 * @param {unknown} config
 * @param {string} label
 * @returns {string[]}
 */
export function validateConfig(config, label = CONFIG_FILE) {
	if (!isPlainObject(config)) throw new Error(`${label}: must be a JSON object`);
	const cfg = /** @type {Record<string, any>} */ (config);
	const errors = [];
	if (typeof cfg.preset !== "string" || cfg.preset === "") {
		errors.push('"preset" must name a preset (run `ai-flow presets`)');
	}
	if (cfg.extends !== undefined) {
		const names = Array.isArray(cfg.extends) ? cfg.extends : [cfg.extends];
		if (!isStringArray(names)) {
			errors.push('"extends" must be a mixin name or an array of mixin names');
		} else {
			const mixins = new Set(
				listPresets()
					.filter((preset) => preset.mixin)
					.map((preset) => preset.name),
			);
			for (const name of names) {
				if (!mixins.has(name)) errors.push(`"extends" → "${name}" is not a mixin (run \`ai-flow presets\`)`);
			}
		}
	}
	if (cfg.vars !== undefined && !isPlainObject(cfg.vars)) errors.push('"vars" must be an object');
	for (const key of ARRAY_KEYS) {
		if (cfg[key] !== undefined && !isStringArray(cfg[key])) errors.push(`"${key}" must be an array of strings`);
	}
	if (cfg.skills !== undefined) {
		if (!isPlainObject(cfg.skills)) {
			errors.push('"skills" must be an object of "<owner>/<repo>": ["skill", ...]');
		} else {
			for (const [source, names] of Object.entries(cfg.skills)) {
				if (!SKILL_SOURCE.test(source)) errors.push(`"skills" → "${source}" is not an <owner>/<repo> source`);
				if (!isStringArray(names)) errors.push(`"skills" → "${source}" must be an array of skill names`);
				else errors.push(...badSkillNames(names, `"skills" → "${source}"`));
			}
		}
	}
	if (isStringArray(cfg.disabledSkills)) errors.push(...badSkillNames(cfg.disabledSkills, '"disabledSkills"'));
	if (errors.length > 0) throw new Error(`${label}:\n  - ${errors.join("\n  - ")}`);
	return Object.keys(cfg)
		.filter((key) => !KNOWN_KEYS.has(key))
		.map((key) => `${label}: unknown key "${key}" is ignored.`);
}

/**
 * @param {string[]} names
 * @param {string} label
 */
const badSkillNames = (names, label) =>
	names
		.filter((name) => !SKILL_NAME.test(name))
		.map((name) => `${label}: ${JSON.stringify(name)} is not a skill name (letters, digits, ".", "_", "-")`);

/** @param {string} projectDir */
export function readConfig(projectDir) {
	const file = path.join(projectDir, CONFIG_FILE);
	if (!existsSync(file)) {
		throw new Error(`${CONFIG_FILE} not found in ${projectDir}. Run \`ai-flow init --preset <name>\` first.`);
	}
	const config = readJson(file);
	const warnings = validateConfig(config);
	return { config, warnings, file };
}

/**
 * @param {string} file
 * @param {any} config
 */
export function writeConfig(file, config) {
	writeFileSync(file, `${JSON.stringify(config, null, "\t")}\n`);
}

/** @param {string} preset */
export function newConfig(preset) {
	return {
		$schema: SCHEMA_URL,
		preset,
		vars: {},
		disabledRoles: [],
		disabledFiles: [],
		skills: {},
		disabledSkills: [],
	};
}
