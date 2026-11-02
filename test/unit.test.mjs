import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { parseArgs } from "../bin/ai-flow.mjs";
import { validateConfig } from "../lib/config.mjs";
import { unifiedDiff } from "../lib/diff.mjs";
import { layersFor, presetChain } from "../lib/layers.mjs";
import { applyBlocks, render, withManagedNote } from "../lib/render.mjs";
import { normalizeSource, skillsCommand } from "../lib/skills.mjs";
import { deepMerge, splitCommand } from "../lib/util.mjs";

describe("render", () => {
	it("replaces dotted vars and leaves GitHub Actions expressions alone", () => {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: the GitHub Actions syntax is what this test checks.
		const out = render("ref: @@b.main@@ ${{ github.ref }}", { b: { main: "main" } }, "t");
		// biome-ignore lint/suspicious/noTemplateCurlyInString: the GitHub Actions syntax is what this test checks.
		assert.equal(out, "ref: main ${{ github.ref }}");
	});

	it("fails on unknown vars, naming the file", () => {
		assert.throws(() => render("@@nope.x@@", {}, "core/x.md"), /core\/x\.md: unknown var\(s\) nope\.x/);
	});

	it("does not resolve inherited properties", () => {
		assert.throws(() => render("@@constructor@@", {}, "t"), /unknown var\(s\) constructor/);
		assert.throws(() => render("@@a.toString@@", { a: {} }, "t"), /unknown var\(s\) a\.toString/);
	});

	it("indents multi-line values to the placeholder's indentation", () => {
		const out = render("list:\n   @@v@@\nend", { v: "- a\n- b" }, "t");
		assert.equal(out, "list:\n   - a\n   - b\nend");
	});

	it("renders arrays as JSON", () => {
		assert.equal(render('{"entry": @@e@@}', { e: ["a", "b"] }, "t"), '{"entry": ["a","b"]}');
	});
});

describe("deepMerge", () => {
	it("merges nested objects and replaces arrays", () => {
		assert.deepEqual(deepMerge({ a: { x: 1, y: 2 }, l: [1] }, { a: { y: 3 }, l: [2] }), {
			a: { x: 1, y: 3 },
			l: [2],
		});
	});

	it("ignores __proto__ from parsed JSON", () => {
		const merged = deepMerge({}, JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}'));
		assert.equal(Object.getPrototypeOf(merged), Object.prototype);
		assert.equal(merged.polluted, undefined);
		assert.equal(merged.ok, 1);
	});
});

describe("applyBlocks", () => {
	it("rewrites only the marked block and reports missing markers", () => {
		const text = "top\n<!-- ai-flow:shared-core:start -->\nold\n<!-- ai-flow:shared-core:end -->\nmine";
		const { text: out, missing } = applyBlocks(text, { "shared-core": "new", "stack-preset": "s" });
		assert.match(out, /start -->\n<!-- Managed[^\n]*-->\nnew\n<!-- ai-flow:shared-core:end -->\nmine$/);
		assert.deepEqual(missing, ["stack-preset"]);
	});

	it("reports duplicated and out-of-order markers as malformed and leaves them alone", () => {
		const dup = "<!-- ai-flow:a:start -->\n<!-- ai-flow:a:end -->\n<!-- ai-flow:a:start -->\n<!-- ai-flow:a:end -->";
		assert.deepEqual(applyBlocks(dup, { a: "x" }), { text: dup, missing: [], malformed: ["a"] });
		const reversed = "<!-- ai-flow:a:end -->\n<!-- ai-flow:a:start -->";
		assert.deepEqual(applyBlocks(reversed, { a: "x" }).malformed, ["a"]);
	});
});

describe("withManagedNote", () => {
	it("puts the note after front matter, after a shebang, or first", () => {
		assert.match(withManagedNote("a.md", "---\nname: x\n---\nbody"), /^---\nname: x\n---\n<!-- Managed/);
		assert.match(withManagedNote("a.md", "# Title"), /^<!-- Managed[^\n]*-->\n# Title$/);
		assert.match(withManagedNote("a.md", "---\nno closing"), /^<!-- Managed/);
		assert.match(withManagedNote("s.sh", "#!/bin/sh\necho"), /^#!\/bin\/sh\n# Managed[^\n]*\necho$/);
		assert.match(withManagedNote("w.yml", "name: x"), /^# Managed[^\n]*\nname: x$/);
		assert.equal(withManagedNote("c.json", "{}"), "{}");
	});
});

describe("splitCommand", () => {
	it("splits quoted command lines and JSON arrays", () => {
		assert.deepEqual(splitCommand('"/Program Files/node" stub.mjs -y'), ["/Program Files/node", "stub.mjs", "-y"]);
		assert.deepEqual(splitCommand("a 'b c' d\\ e"), ["a", "b c", "d e"]);
		assert.deepEqual(splitCommand('["/a b/node", "x"]'), ["/a b/node", "x"]);
		assert.throws(() => splitCommand("a 'b"), /unclosed/);
	});

	it("defaults the skills command to npx skills", () => {
		assert.deepEqual(skillsCommand({}), ["npx", "-y", "skills"]);
	});
});

describe("normalizeSource", () => {
	it("treats GitHub URL spellings as one source", () => {
		for (const source of ["antfu/skills", "github:antfu/skills", "https://github.com/Antfu/skills.git"]) {
			assert.equal(normalizeSource(source), "antfu/skills");
		}
	});
});

describe("validateConfig", () => {
	it("rejects configs that cannot work, naming every problem", () => {
		assert.throws(() => validateConfig({}), /"preset" must name a preset/);
		assert.throws(() => validateConfig([]), /must be a JSON object/);
		assert.throws(
			() => validateConfig({ preset: "node-ts", disabledRoles: "planner", skills: { "a/b": "x" } }),
			/"disabledRoles" must be an array of strings[\s\S]*"a\/b" must be an array/,
		);
	});

	it("rejects skill sources and names the skills CLI would misread", () => {
		assert.throws(
			() =>
				validateConfig({
					preset: "node-ts",
					skills: { "https://evil.example/x": ["ok"], "a/b": ["-g", "fine"] },
					disabledSkills: ["--yes"],
				}),
			/"https:\/\/evil\.example\/x" is not an <owner>\/<repo> source[\s\S]*"-g" is not a skill name[\s\S]*"--yes" is not a skill name/,
		);
		assert.deepEqual(validateConfig({ preset: "node-ts", skills: { "a/b": ["c.d_e-1"] } }), []);
	});

	it("warns about unknown keys", () => {
		assert.deepEqual(validateConfig({ preset: "node-ts", $schema: "x", prest: 1 }), [
			'.ai-flow.json: unknown key "prest" is ignored.',
		]);
	});
});

describe("presetChain", () => {
	it("applies parents first and a shared parent once", () => {
		const names = presetChain("typescript-vite-firebase").map((dir) => dir.split(/[\\/]/).at(-1));
		assert.deepEqual(names, ["node-base", "node-ts", "firebase", "typescript-vite-firebase"]);
	});

	it("rejects unknown and path-like preset names", () => {
		assert.throws(() => presetChain("cobol"), /Unknown preset "cobol"/);
		assert.throws(() => presetChain("../core"), /Invalid preset name/);
	});
});

describe("parseArgs", () => {
	it("rejects an option with no value", () => {
		assert.throws(() => parseArgs(["sync", "--dir"]), /--dir needs a value/);
		assert.throws(() => parseArgs(["init", "--preset", "--dry-run"]), /--preset needs a value/);
	});

	it("reads flags and positionals", () => {
		const options = parseArgs(["check", "--strict", "--json", "-h"]);
		assert.equal(options.command, "check");
		assert.equal(options.strict, true);
		assert.equal(options.json, true);
		assert.equal(options.help, true);
	});
});

describe("project extends", () => {
	it("accepts a mixin name or a list of mixin names", () => {
		assert.deepEqual(validateConfig({ preset: "node-ts", extends: "egm" }), []);
		assert.deepEqual(validateConfig({ preset: "node-ts", extends: ["egm"] }), []);
	});

	it("rejects a preset that is not a mixin", () => {
		assert.throws(() => validateConfig({ preset: "node-ts", extends: "node-base" }), /not a mixin/);
	});

	it("rejects a non-string extends", () => {
		assert.throws(() => validateConfig({ preset: "node-ts", extends: 42 }), /mixin name or an array/);
	});

	it("layers the mixin after the preset chain", () => {
		const layers = layersFor("node-ts", ["egm"]);
		const posix = (dir) => dir.replaceAll(path.sep, "/");
		const egm = layers.findIndex((dir) => posix(dir).endsWith("/presets/egm"));
		const nodeTs = layers.findIndex((dir) => posix(dir).endsWith("/presets/node-ts"));
		assert.ok(egm > nodeTs, "egm must come after node-ts");
		assert.equal(layers.filter((dir) => posix(dir).endsWith("/presets/egm")).length, 1);
	});
});

describe("unifiedDiff", () => {
	it("prints hunks with context", () => {
		const out = unifiedDiff("a\nb\nc\nd", "a\nB\nc\nd", "a/f", "b/f", 1);
		assert.equal(out, "--- a/f\n+++ b/f\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c");
	});

	it("handles created files", () => {
		assert.equal(unifiedDiff("", "x\n", "/dev/null", "b/f"), "--- /dev/null\n+++ b/f\n@@ -0,0 +1,1 @@\n+x");
	});

	it("marks a missing final newline, and shows a newline change", () => {
		assert.equal(
			unifiedDiff("", "x", "/dev/null", "b/f"),
			"--- /dev/null\n+++ b/f\n@@ -0,0 +1,1 @@\n+x\n\\ No newline at end of file",
		);
		assert.equal(
			unifiedDiff("a\nb", "a\nb\n", "a/f", "b/f"),
			"--- a/f\n+++ b/f\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b",
		);
	});
});
