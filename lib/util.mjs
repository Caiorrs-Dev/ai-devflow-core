// Small helpers shared by every module. No dependencies beyond Node built-ins.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

// Keys that would reach Object.prototype when copied from parsed JSON.
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** @param {unknown} value */
export function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Skill sources and names reach the `skills` CLI as arguments: a name that
// starts with `-` would be read as an option.
export const SKILL_SOURCE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** @param {unknown} value */
export const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * Reads and parses a JSON file. Errors name the file.
 * @param {string} file
 */
export function readJson(file) {
	let text;
	try {
		text = readFileSync(file, "utf8");
	} catch (error) {
		throw new Error(`${file}: ${errorMessage(error)}`);
	}
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new Error(`${file}: invalid JSON: ${errorMessage(error)}`);
	}
}

/**
 * @param {string} file
 * @param {any} fallback
 */
export const readJsonIfExists = (file, fallback) => (existsSync(file) ? readJson(file) : fallback);

/** @param {unknown} error */
export const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

/**
 * Objects merge key by key; anything else (arrays included) is replaced.
 * @param {any} base
 * @param {any} override
 * @returns {any}
 */
export function deepMerge(base, override) {
	if (!isPlainObject(base) || !isPlainObject(override)) return override;
	const merged = { ...base };
	for (const [key, value] of Object.entries(override)) {
		if (FORBIDDEN_KEYS.has(key)) continue;
		merged[key] = Object.hasOwn(base, key) ? deepMerge(base[key], value) : value;
	}
	return merged;
}

/** @param {string} text */
export const normalizeEol = (text) => text.replace(/\r\n/g, "\n");

/** @param {string} text */
export const sha256 = (text) => createHash("sha256").update(normalizeEol(text)).digest("hex");

/**
 * Reads a text file with LF line endings, or null when it is missing or not a
 * regular file.
 * @param {string} file
 */
export function readTextIfFile(file) {
	try {
		if (!statSync(file).isFile()) return null;
	} catch {
		return null;
	}
	return normalizeEol(readFileSync(file, "utf8"));
}

/**
 * Splits a command line into argv. Accepts a JSON array of strings, or a string
 * with single quotes, double quotes and backslash escapes, so paths with spaces
 * survive.
 * @param {string} text
 * @returns {string[]}
 */
export function splitCommand(text) {
	const trimmed = text.trim();
	if (trimmed.startsWith("[")) {
		const parsed = JSON.parse(trimmed);
		if (!isStringArray(parsed) || parsed.length === 0) {
			throw new Error("a JSON command must be a non-empty array of strings");
		}
		return parsed;
	}
	const args = [];
	let current = "";
	let quote = "";
	let started = false;
	for (let index = 0; index < trimmed.length; index += 1) {
		const char = trimmed[index];
		if (quote) {
			if (char === quote) quote = "";
			else if (char === "\\" && quote === '"' && index + 1 < trimmed.length) current += trimmed[++index];
			else current += char;
		} else if (char === '"' || char === "'") {
			quote = char;
			started = true;
		} else if (char === "\\" && index + 1 < trimmed.length) {
			current += trimmed[++index];
			started = true;
		} else if (/\s/.test(char)) {
			if (started) args.push(current);
			current = "";
			started = false;
		} else {
			current += char;
			started = true;
		}
	}
	if (quote) throw new Error(`unclosed ${quote} in command: ${text}`);
	if (started) args.push(current);
	if (args.length === 0) throw new Error("empty command");
	return args;
}

const isWindows = process.platform === "win32";

// On Windows, npx/npm/gh may be .cmd shims, which Node spawns only through a
// shell. Arguments are quoted for cmd.exe in that case.
/** @param {string} arg */
const quoteForCmd = (arg) => (/[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg);

/**
 * Runs a tool and returns its result. `inherit` streams output to this process.
 * @param {string[]} argv
 * @param {{ cwd?: string, inherit?: boolean }} [options]
 */
export function runTool(argv, { cwd, inherit = false } = {}) {
	const [bin, ...args] = argv;
	const useShell = isWindows && !/[\\/]/.test(bin) && !/\.exe$/i.test(bin);
	const result = useShell
		? spawnSync([bin, ...args].map(quoteForCmd).join(" "), {
				cwd,
				shell: true,
				encoding: "utf8",
				stdio: inherit ? ["ignore", "inherit", "inherit"] : "pipe",
			})
		: spawnSync(bin, args, {
				cwd,
				encoding: "utf8",
				stdio: inherit ? ["ignore", "inherit", "inherit"] : "pipe",
			});
	return result;
}
