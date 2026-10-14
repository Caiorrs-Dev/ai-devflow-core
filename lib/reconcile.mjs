// Compares the plan with the project and, with `write`, applies it.
//
// `.ai-flow.lock.json` (committed) records what the last sync wrote and which
// ai-devflow-core version wrote it. With it, sync can:
// - remove managed files that are no longer part of the plan (orphans),
// - write each seed once: a seed the project deleted is not written again,
// - tell a locally edited managed file from an outdated one.

import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readlinkSync,
	rmdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { ROOT } from "./layers.mjs";
import { INSTRUCTION_LINKS, INSTRUCTIONS_FILE, resolvePlan } from "./plan.mjs";
import { applyBlocks } from "./render.mjs";
import { SKILLS_LOCK, skillLockStatus } from "./skills.mjs";
import { isPlainObject, readJson, readJsonIfExists, readTextIfFile, sha256 } from "./util.mjs";

export const LOCK_FILE = ".ai-flow.lock.json";

export const toolVersion = () => String(readJson(path.join(ROOT, "package.json")).version);

/** @param {string} rel */
const isExecutable = (rel) => rel.startsWith(".husky/") || rel.endsWith(".sh");

/**
 * @param {string} projectDir
 * @param {string} rel
 * @param {string} text
 */
function writeFile(projectDir, rel, text) {
	const target = path.join(projectDir, rel);
	mkdirSync(path.dirname(target), { recursive: true });
	writeFileSync(target, text);
	if (isExecutable(rel)) chmodSync(target, 0o755);
}

/**
 * Whether `target` is strictly inside `dir`. A plain prefix test would accept
 * a sibling such as `/proj-other` for `/proj`.
 * @param {string} dir
 * @param {string} target
 */
function isInside(dir, target) {
	const relative = path.relative(dir, target);
	return relative !== "" && relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative);
}

/**
 * Whether a path read from the lock names a file inside the project. The lock
 * is committed, so a crafted one must not point sync at anything outside.
 * @param {string} projectDir
 * @param {string} rel
 */
const isProjectPath = (projectDir, rel) =>
	!path.isAbsolute(rel) && !rel.split(/[\\/]/).includes("..") && isInside(projectDir, path.resolve(projectDir, rel));

/**
 * Deletes a file, then its parent folders while they are empty.
 * @param {string} projectDir
 * @param {string} rel
 */
function removeFile(projectDir, rel) {
	const root = path.resolve(projectDir);
	const target = path.resolve(root, rel);
	if (!isInside(root, target)) throw new Error(`refusing to remove ${rel}: it is outside the project`);
	rmSync(target, { force: true });
	let dir = path.dirname(target);
	while (isInside(root, dir) && readdirSync(dir).length === 0) {
		rmdirSync(dir);
		dir = path.dirname(dir);
	}
}

/** @param {string} file */
function isSymlink(file) {
	try {
		return lstatSync(file).isSymbolicLink();
	} catch {
		return false;
	}
}

/**
 * A symlink to CLAUDE.md, or a copy where symlinks are not available (Windows
 * without Developer Mode). AI_FLOW_NO_SYMLINK=1 forces the copy.
 * @param {string} projectDir
 * @param {string} link
 * @param {string | null} instructions
 * @returns {"symlink" | "copy"}
 */
function createLink(projectDir, link, instructions) {
	const linkPath = path.join(projectDir, link);
	mkdirSync(path.dirname(linkPath), { recursive: true });
	if (!process.env.AI_FLOW_NO_SYMLINK) {
		try {
			symlinkSync(INSTRUCTIONS_FILE, linkPath, "file");
			return "symlink";
		} catch {
			// Fall through to a copy.
		}
	}
	writeFileSync(linkPath, instructions ?? "");
	return "copy";
}

/**
 * @param {Record<string, any>} lock
 */
function lockText(lock) {
	const files = Object.fromEntries(Object.entries(lock.files).sort(([a], [b]) => a.localeCompare(b)));
	const links = Object.fromEntries(Object.entries(lock.links).sort(([a], [b]) => a.localeCompare(b)));
	return `${JSON.stringify({ ...lock, files, links }, null, "\t")}\n`;
}

/**
 * Whether a seed rule says not to create the seed.
 * @param {string} projectDir
 * @param {any} rule
 */
function seedSkipped(projectDir, rule) {
	if (!rule) return false;
	return rule.skipIf.some((/** @type {any} */ condition) => {
		if (typeof condition.exists === "string") return existsSync(path.join(projectDir, condition.exists));
		if (typeof condition.file === "string" && typeof condition.contains === "string") {
			return (readTextIfFile(path.join(projectDir, condition.file)) ?? "").includes(condition.contains);
		}
		return false;
	});
}

/**
 * @typedef {{ created: string[], updated: string[], removed: string[], drift: string[],
 *   warnings: string[], diffs: { rel: string, before: string, after: string }[] }} Report
 */

/**
 * @param {string} projectDir
 * @param {{ write: boolean }} options
 */
export function reconcile(projectDir, { write }) {
	const plan = resolvePlan(projectDir);
	/** @type {Report} */
	const report = { created: [], updated: [], removed: [], drift: [], warnings: [...plan.warnings], diffs: [] };
	/** @param {string} rel */
	const read = (rel) => readTextIfFile(path.join(projectDir, rel));

	const previous = readJsonIfExists(path.join(projectDir, LOCK_FILE), null);
	/** @type {Record<string, any>} */
	const prevFiles = {};
	for (const [rel, entry] of Object.entries(isPlainObject(previous?.files) ? previous.files : {})) {
		if (isProjectPath(projectDir, rel)) prevFiles[rel] = entry;
		else report.warnings.push(`${LOCK_FILE} lists "${rel}", which is outside the project; ignored.`);
	}
	const prevLinks = isPlainObject(previous?.links) ? previous.links : {};
	const version = toolVersion();
	// `links` lists only AGENTS.md/GEMINI.md written as copies; symlinks need no record.
	/** @type {{ version: string, preset: string, files: Record<string, any>, links: Record<string, string> }} */
	const nextLock = { version, preset: plan.config.preset, files: {}, links: {} };

	for (const [rel, text] of plan.managed) {
		nextLock.files[rel] = { kind: "managed", sha256: sha256(text) };
		const current = read(rel);
		if (current === text) continue;
		let state = "missing";
		if (current !== null) {
			const recorded = prevFiles[rel]?.sha256;
			if (!recorded) state = "modified";
			else state = recorded === sha256(current) ? "outdated" : "edited locally";
		}
		report.drift.push(`${state}: ${rel}`);
		report.diffs.push({ rel, before: current ?? "", after: text });
		if (write) {
			writeFile(projectDir, rel, text);
			(current === null ? report.created : report.updated).push(rel);
		}
	}

	const createdSeeds = new Set();
	for (const [rel, text] of plan.seed) {
		if (plan.managed.has(rel)) continue;
		if (read(rel) !== null || prevFiles[rel]?.kind === "seed") {
			// Present, or deleted by the project after an earlier sync: the
			// project owns it either way.
			nextLock.files[rel] = { kind: "seed" };
			continue;
		}
		if (seedSkipped(projectDir, plan.seedRules[rel])) continue;
		nextLock.files[rel] = { kind: "seed" };
		report.drift.push(`missing seed: ${rel}`);
		report.diffs.push({ rel, before: "", after: text });
		createdSeeds.add(rel);
		if (write) {
			writeFile(projectDir, rel, text);
			report.created.push(rel);
		}
	}

	// Managed files of an earlier sync that the plan no longer has.
	for (const [rel, entry] of Object.entries(prevFiles)) {
		if (entry?.kind !== "managed" || plan.managed.has(rel)) continue;
		const current = read(rel);
		if (current === null) continue;
		if (sha256(current) !== entry.sha256) {
			report.warnings.push(`${rel} is no longer managed and was edited locally; delete it by hand if unused.`);
			continue;
		}
		report.drift.push(`orphan: ${rel}`);
		report.diffs.push({ rel, before: current, after: "" });
		if (write) {
			removeFile(projectDir, rel);
			report.removed.push(rel);
		}
	}

	let instructions = read(INSTRUCTIONS_FILE);
	if (instructions === null && createdSeeds.has(INSTRUCTIONS_FILE)) {
		instructions = plan.seed.get(INSTRUCTIONS_FILE) ?? null;
	}
	if (instructions !== null) {
		const { text, missing, malformed } = applyBlocks(instructions, plan.blocks);
		for (const name of missing) {
			report.warnings.push(
				`${INSTRUCTIONS_FILE} has no ai-flow:${name} markers; add <!-- ai-flow:${name}:start --> and <!-- ai-flow:${name}:end --> where the block belongs.`,
			);
		}
		for (const name of malformed) {
			report.warnings.push(
				`${INSTRUCTIONS_FILE} has duplicated or out-of-order ai-flow:${name} markers; keep exactly one start before one end.`,
			);
		}
		if (text !== instructions) {
			if (!createdSeeds.has(INSTRUCTIONS_FILE)) {
				report.drift.push(`modified block: ${INSTRUCTIONS_FILE}`);
				report.diffs.push({ rel: INSTRUCTIONS_FILE, before: instructions, after: text });
			}
			if (write) {
				writeFile(projectDir, INSTRUCTIONS_FILE, text);
				if (!createdSeeds.has(INSTRUCTIONS_FILE)) report.updated.push(INSTRUCTIONS_FILE);
			}
			instructions = text;
		}
	}

	checkPackage(read, plan, report);

	// With no CLAUDE.md there is nothing to link to: a symlink would dangle and
	// a copy would be empty. Say so, unless the project disabled CLAUDE.md.
	let noInstructionsWarned = (plan.config.disabledFiles ?? []).includes(INSTRUCTIONS_FILE);
	for (const link of INSTRUCTION_LINKS) {
		const linkPath = path.join(projectDir, link);
		if (isSymlink(linkPath)) {
			if (readlinkSync(linkPath) !== INSTRUCTIONS_FILE)
				report.warnings.push(`${link} is a symlink, but not to ${INSTRUCTIONS_FILE}.`);
			else if (instructions === null)
				report.warnings.push(`${link} links to ${INSTRUCTIONS_FILE}, which is missing; delete ${link} or restore it.`);
			continue;
		}
		const current = read(link);
		if (current !== null) {
			if (prevLinks[link] === "copy") {
				nextLock.links[link] = "copy";
				if (instructions !== null && current !== instructions) {
					report.drift.push(`stale copy: ${link}`);
					report.diffs.push({ rel: link, before: current, after: instructions });
					if (write) {
						writeFile(projectDir, link, instructions);
						report.updated.push(link);
					}
				}
			} else if (current.trim() === INSTRUCTIONS_FILE) {
				report.warnings.push(
					`${link} is a plain file that holds "${INSTRUCTIONS_FILE}": git checked the symlink out without symlink support (core.symlinks=false). Enable symlinks, or delete ${link} and sync to get a copy.`,
				);
			} else {
				report.warnings.push(
					`${link} exists and is not a symlink to ${INSTRUCTIONS_FILE}; merge it into ${INSTRUCTIONS_FILE}.`,
				);
			}
			continue;
		}
		if (instructions === null) {
			if (!noInstructionsWarned) {
				report.warnings.push(
					`${INSTRUCTIONS_FILE} is missing, so ${INSTRUCTION_LINKS.join(" and ")} are not created; restore it and sync.`,
				);
				noInstructionsWarned = true;
			}
			continue;
		}
		report.drift.push(`missing link: ${link} -> ${INSTRUCTIONS_FILE}`);
		if (write) {
			const mode = createLink(projectDir, link, instructions);
			if (mode === "copy") nextLock.links[link] = "copy";
			report.created.push(`${link} -> ${INSTRUCTIONS_FILE}${mode === "copy" ? " (copy)" : ""}`);
		}
	}

	const { missing, mismatched } = skillLockStatus(plan.skills, path.join(projectDir, SKILLS_LOCK));
	for (const [source, names] of missing) {
		report.drift.push(`skills not in ${SKILLS_LOCK}: ${names.join(", ")} (${source}); run ai-flow skills install`);
	}
	for (const { name, expected, actual } of mismatched) {
		report.drift.push(
			`skill ${name} is locked from ${actual}, not ${expected}; run ai-flow skills add ${expected} ${name}`,
		);
	}

	// The lock itself. A version change alone is a warning, not drift, so a
	// newer ai-flow with identical output does not fail `check`.
	const text = lockText(nextLock);
	const currentLock = read(LOCK_FILE);
	if (previous && previous.version !== version) {
		report.warnings.push(`${LOCK_FILE} was written by ai-devflow-core ${previous.version}; this is ${version}.`);
	}
	if (currentLock !== text) {
		const sameButVersion = previous && lockText({ ...previous, version, files: prevFiles, links: prevLinks }) === text;
		if (!sameButVersion) report.drift.push(`${currentLock === null ? "missing" : "outdated"}: ${LOCK_FILE}`);
		if (write) {
			writeFile(projectDir, LOCK_FILE, text);
			(currentLock === null ? report.created : report.updated).push(LOCK_FILE);
		}
	}

	return { plan, report };
}

/**
 * package.json belongs to the project: report what the preset needs, never
 * edit it.
 * @param {(rel: string) => string | null} read
 * @param {ReturnType<typeof resolvePlan>} plan
 * @param {Report} report
 */
function checkPackage(read, plan, report) {
	const pkgText = read("package.json");
	if (pkgText === null) return;
	let pkg;
	try {
		pkg = JSON.parse(pkgText);
	} catch (error) {
		report.warnings.push(`package.json is not valid JSON: ${error instanceof Error ? error.message : error}`);
		return;
	}
	const deps = { ...pkg.dependencies, ...pkg.devDependencies };
	for (const script of plan.requires.packageScripts) {
		if (!pkg.scripts?.[script]) report.warnings.push(`package.json has no "${script}" script; the cycle runs it.`);
	}
	for (const dep of plan.requires.devDependencies) {
		if (!deps[dep]) report.warnings.push(`package.json does not depend on ${dep}.`);
	}
	const manifestText = read(".release-please-manifest.json");
	if (manifestText !== null && typeof pkg.version === "string") {
		try {
			const released = JSON.parse(manifestText)["."];
			if (typeof released === "string" && released !== pkg.version) {
				report.warnings.push(
					`.release-please-manifest.json says ${released} but package.json says ${pkg.version}; release-please bumps from the manifest.`,
				);
			}
		} catch {
			report.warnings.push(".release-please-manifest.json is not valid JSON.");
		}
	}
}
