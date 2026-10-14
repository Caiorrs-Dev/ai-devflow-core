// `ai-flow doctor`: checks the GitHub side of the setup that the CLI cannot
// write — branches, required status checks, merge methods, secrets — with the
// `gh` CLI. AI_FLOW_GH_CMD replaces `gh` (the tests use a stub).

import { resolvePlan } from "./plan.mjs";
import { errorMessage, runTool, splitCommand } from "./util.mjs";

/** @param {NodeJS.ProcessEnv} [env] */
export const ghCommand = (env = process.env) => (env.AI_FLOW_GH_CMD ? splitCommand(env.AI_FLOW_GH_CMD) : ["gh"]);

/**
 * @param {string[]} args
 * @param {string} cwd
 */
function gh(args, cwd) {
	const result = runTool([...ghCommand(), ...args], { cwd });
	if (result.error) return { ok: false, stdout: "", stderr: errorMessage(result.error) };
	return { ok: result.status === 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/**
 * @param {{ ok: boolean, stdout: string }} result
 * @param {any} fallback
 */
function json(result, fallback) {
	if (!result.ok) return fallback;
	try {
		return JSON.parse(result.stdout);
	} catch {
		return fallback;
	}
}

/** @param {string} text */
const firstLine = (text) => text.trim().split("\n")[0] || "no output";

/**
 * Status checks a branch requires, from classic branch protection and from
 * rulesets.
 * @param {string} repo
 * @param {string} branch
 * @param {string} cwd
 */
function requiredChecks(repo, branch, cwd) {
	const checks = new Set();
	const encoded = encodeURIComponent(branch);
	const protection = json(gh(["api", `repos/${repo}/branches/${encoded}/protection/required_status_checks`], cwd), {});
	for (const context of protection.contexts ?? []) checks.add(context);
	for (const check of protection.checks ?? []) if (check?.context) checks.add(check.context);
	const rules = json(gh(["api", `repos/${repo}/rules/branches/${encoded}`], cwd), []);
	for (const rule of Array.isArray(rules) ? rules : []) {
		if (rule?.type !== "required_status_checks") continue;
		for (const check of rule.parameters?.required_status_checks ?? []) if (check?.context) checks.add(check.context);
	}
	return checks;
}

/**
 * @param {string} projectDir
 * @returns {{ level: "ok" | "warn" | "fail", message: string }[]}
 */
export function doctor(projectDir) {
	const plan = resolvePlan(projectDir);
	/** @type {{ level: "ok" | "warn" | "fail", message: string }[]} */
	const results = [];
	/** @type {(level: "ok" | "warn" | "fail", message: string) => void} */
	const add = (level, message) => {
		results.push({ level, message });
	};

	const view = gh(["repo", "view", "--json", "nameWithOwner,squashMergeAllowed,mergeCommitAllowed"], projectDir);
	const info = json(view, null);
	if (!info?.nameWithOwner) {
		add(
			"fail",
			`gh cannot read the repository (${firstLine(view.stderr)}). Install gh, run \`gh auth login\`, and run doctor inside the repository.`,
		);
		return results;
	}
	const repo = info.nameWithOwner;
	add("ok", `repository ${repo}`);

	if (info.squashMergeAllowed) add("ok", "squash merge is allowed (feature PRs)");
	else add("warn", "squash merge is off: feature PRs should squash so the PR title becomes the commit.");
	if (info.mergeCommitAllowed) add("ok", "merge commits are allowed (promotion PRs)");
	else add("warn", "merge commits are off: promotion PRs should merge so release-please sees every commit.");

	const branches = [plan.vars.branches?.integration, plan.vars.branches?.production].filter(Boolean);
	const wanted = [...plan.requires.checks];
	for (const branch of branches) {
		const exists = gh(["api", `repos/${repo}/branches/${encodeURIComponent(branch)}`], projectDir);
		if (!exists.ok) {
			add("fail", `branch ${branch} does not exist on GitHub.`);
			continue;
		}
		const checks = requiredChecks(repo, branch, projectDir);
		const absent = wanted.filter((check) => !checks.has(check));
		if (absent.length === 0) add("ok", `${branch} requires ${wanted.join(", ") || "no checks"}`);
		else {
			add(
				"fail",
				`${branch} does not require: ${absent.join(", ")}. Required checks match job names; add them to the branch protection or ruleset.`,
			);
		}
	}

	const secretList = gh(["secret", "list", "--json", "name"], projectDir);
	if (!secretList.ok) {
		add("warn", `cannot list secrets (${firstLine(secretList.stderr)}); check them by hand.`);
	} else {
		// Organization secrets shared with this repository count too. Listing
		// them needs admin rights on the repository, so a failure only means
		// "unknown", never "not set".
		const orgList = gh(["api", `repos/${repo}/actions/organization-secrets`], projectDir);
		const orgSecrets = json(orgList, null);
		const orgUnknown =
			orgSecrets === null ? ` (organization secrets could not be read: ${firstLine(orgList.stderr)})` : "";
		const names = new Set(
			[...json(secretList, []), ...(orgSecrets?.secrets ?? [])].map((/** @type {any} */ secret) => secret?.name),
		);
		for (const secret of plan.requires.secrets) {
			if (names.has(secret)) add("ok", `secret ${secret}`);
			else if (orgUnknown) add("warn", `secret ${secret} is not a repository secret${orgUnknown}; check it by hand.`);
			else add("warn", `secret ${secret} is not set.`);
		}
		// Without its own token, release-please opens the release PR with
		// GITHUB_TOKEN, which GitHub refuses unless the repository allows it.
		if (plan.requires.secrets.has("RELEASE_PLEASE_TOKEN") && !names.has("RELEASE_PLEASE_TOKEN")) {
			const permissions = json(gh(["api", `repos/${repo}/actions/permissions/workflow`], projectDir), null);
			if (permissions?.can_approve_pull_request_reviews === false && !orgUnknown) {
				add(
					"fail",
					'release-please cannot open its PR: set RELEASE_PLEASE_TOKEN (repository or organization secret), or turn on "Allow GitHub Actions to create and approve pull requests" (Settings > Actions > General; in an organization, enable it in the organization settings first).',
				);
			}
		}
	}
	return results;
}
