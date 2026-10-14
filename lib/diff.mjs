// A small unified diff (LCS over lines) for `ai-flow diff`.

const MAX_CELLS = 4_000_000;
const NO_EOL = "\\ No newline at end of file";
// Appended to a last line with no newline, so it never equals the same text
// with one: the diff then shows the newline change, like git does.
const NO_EOL_KEY = "\u0000no-eol";

/**
 * Lines without the final newline, keyed for comparison.
 * @param {string} text
 */
function lines(text) {
	if (text === "") return { text: [], keys: [] };
	const eol = text.endsWith("\n");
	const list = (eol ? text.slice(0, -1) : text).split("\n");
	const keys = eol ? list : [...list.slice(0, -1), `${list.at(-1)}${NO_EOL_KEY}`];
	return { text: list, keys };
}

/**
 * @param {string} before
 * @param {string} after
 * @param {string} fromLabel
 * @param {string} toLabel
 * @param {number} [context]
 */
export function unifiedDiff(before, after, fromLabel, toLabel, context = 3) {
	const { text: aText, keys: a } = lines(before);
	const { text: bText, keys: b } = lines(after);
	const header = [`--- ${fromLabel}`, `+++ ${toLabel}`];
	if ((a.length + 1) * (b.length + 1) > MAX_CELLS) return [...header, "(files differ; too large to diff)"].join("\n");

	const width = b.length + 1;
	const lcs = new Uint32Array((a.length + 1) * width);
	for (let i = a.length - 1; i >= 0; i -= 1) {
		for (let j = b.length - 1; j >= 0; j -= 1) {
			lcs[i * width + j] =
				a[i] === b[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
		}
	}

	/** @type {{ op: " " | "-" | "+", line: string, ai: number, bi: number }[]} */
	const ops = [];
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			ops.push({ op: " ", line: aText[i], ai: i, bi: j });
			i += 1;
			j += 1;
		} else if (j >= b.length || (i < a.length && lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) {
			ops.push({ op: "-", line: aText[i], ai: i, bi: j });
			i += 1;
		} else {
			ops.push({ op: "+", line: bText[j], ai: i, bi: j });
			j += 1;
		}
	}

	/** @type {[number, number][]} */
	const ranges = [];
	ops.forEach((entry, index) => {
		if (entry.op === " ") return;
		const start = Math.max(0, index - context);
		const end = Math.min(ops.length - 1, index + context);
		const last = ranges.at(-1);
		if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
		else ranges.push([start, end]);
	});

	const out = [...header];
	for (const [start, end] of ranges) {
		const slice = ops.slice(start, end + 1);
		const aLen = slice.filter((entry) => entry.op !== "+").length;
		const bLen = slice.filter((entry) => entry.op !== "-").length;
		const aStart = aLen === 0 ? slice[0].ai : slice[0].ai + 1;
		const bStart = bLen === 0 ? slice[0].bi : slice[0].bi + 1;
		out.push(`@@ -${aStart},${aLen} +${bStart},${bLen} @@`);
		for (const entry of slice) {
			out.push(`${entry.op}${entry.line}`);
			const key = entry.op === "+" ? b[entry.bi] : a[entry.ai];
			if (key.endsWith(NO_EOL_KEY)) out.push(NO_EOL);
		}
	}
	return out.join("\n");
}
