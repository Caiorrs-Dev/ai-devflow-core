#!/usr/bin/env node
// Renders every non-mixin preset into <out>/<preset>/ so CI can lint the
// result (actionlint for workflows, shellcheck for scripts and hooks).
// Usage: node scripts/render-presets.mjs <out-dir>

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listPresets } from "../lib/layers.mjs";

const out = path.resolve(process.argv[2] ?? "rendered");
const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "ai-flow.mjs");
rmSync(out, { recursive: true, force: true });

for (const preset of listPresets().filter((entry) => !entry.mixin)) {
	const dir = path.join(out, preset.name);
	mkdirSync(dir, { recursive: true });
	const result = spawnSync(process.execPath, [cli, "init", "--preset", preset.name, "--dir", dir], {
		encoding: "utf8",
	});
	if (result.status !== 0) {
		process.stderr.write(result.stderr);
		process.exit(1);
	}
	console.log(`rendered: ${path.relative(process.cwd(), dir)}`);
}
