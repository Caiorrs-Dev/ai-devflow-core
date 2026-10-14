// Template rendering, managed-file notes and CLAUDE.md marker blocks.

import { isPlainObject } from "./util.mjs";

const PLACEHOLDER = /@@([A-Za-z0-9_.-]+)@@/g;

export const MANAGED_NOTE = "Managed by ai-devflow-core: edit upstream, then run `ai-flow sync`.";

/**
 * Own-property lookup of a dotted key, so `@@constructor@@` stays unknown.
 * @param {any} vars
 * @param {string} dottedKey
 */
export function lookup(vars, dottedKey) {
	let node = vars;
	for (const key of dottedKey.split(".")) {
		if (!isPlainObject(node) || !Object.hasOwn(node, key)) return undefined;
		node = node[key];
	}
	return node;
}

/**
 * Replaces `@@dotted.var@@` placeholders. Arrays render as JSON. A placeholder
 * alone on an indented line keeps that indentation on every line of a
 * multi-line value (a list inside a list).
 * @param {string} text
 * @param {any} vars
 * @param {string} sourceLabel
 */
export function render(text, vars, sourceLabel) {
	const missing = new Set();
	const output = text.replace(PLACEHOLDER, (match, key, offset) => {
		const value = lookup(vars, key);
		if (value === undefined || value === null || isPlainObject(value)) {
			missing.add(key);
			return match;
		}
		if (Array.isArray(value)) return JSON.stringify(value);
		const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
		const indent = text.slice(lineStart, offset);
		const lines = String(value).split("\n");
		return /^[ \t]*$/.test(indent) ? lines.join(`\n${indent}`) : lines.join("\n");
	});
	if (missing.size > 0) {
		throw new Error(
			`${sourceLabel}: unknown var(s) ${[...missing].join(", ")}. Define them in the preset or in .ai-flow.json "vars".`,
		);
	}
	return output;
}

/**
 * Marks generated files so nobody edits them in place. JSON has no comments,
 * and files with front matter must start with `---`, so the note goes after
 * the front matter, or nowhere.
 * @param {string} rel
 * @param {string} text
 */
export function withManagedNote(rel, text) {
	if (rel.endsWith(".md")) {
		const note = `<!-- ${MANAGED_NOTE} -->\n`;
		if (!text.startsWith("---\n")) return note + text;
		const end = text.indexOf("\n---\n", 4);
		// No closing `---`: not front matter, so the note can go first.
		if (end === -1) return note + text;
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

/**
 * @param {string} text
 * @param {string} needle
 */
const occurrences = (text, needle) => text.split(needle).length - 1;

/**
 * Rewrites the body between `<!-- ai-flow:<name>:start -->` and `:end -->`.
 * Blocks with no markers are reported as missing; duplicated or out-of-order
 * markers as malformed. Neither is touched.
 * @param {string} text
 * @param {Record<string, string>} blocks
 */
export function applyBlocks(text, blocks) {
	let output = text;
	/** @type {string[]} */
	const missing = [];
	/** @type {string[]} */
	const malformed = [];
	for (const [name, body] of Object.entries(blocks)) {
		const start = `<!-- ai-flow:${name}:start -->`;
		const end = `<!-- ai-flow:${name}:end -->`;
		const starts = occurrences(output, start);
		const ends = occurrences(output, end);
		if (starts === 0 && ends === 0) {
			missing.push(name);
			continue;
		}
		const from = output.indexOf(start);
		const to = output.indexOf(end);
		if (starts !== 1 || ends !== 1 || to < from) {
			malformed.push(name);
			continue;
		}
		const inner = `\n<!-- ${MANAGED_NOTE} -->\n${body}\n`;
		output = output.slice(0, from + start.length) + inner + output.slice(to);
	}
	return { text: output, missing, malformed };
}
