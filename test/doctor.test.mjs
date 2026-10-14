import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { run, stubGhCli, tempDir } from "./helpers.mjs";

let project;
beforeEach(() => {
	project = tempDir();
	run(project, "init", "--preset", "node-ts");
});
afterEach(() => rmSync(project, { recursive: true, force: true }));

const REPO = "acme/app";
const repoView = {
	"repo view --json nameWithOwner,squashMergeAllowed,mergeCommitAllowed": {
		stdout: { nameWithOwner: REPO, squashMergeAllowed: true, mergeCommitAllowed: true },
	},
};

describe("doctor", () => {
	it("passes when branches require every check the preset produces", () => {
		const env = stubGhCli({
			...repoView,
			[`api repos/${REPO}/branches/stage`]: { stdout: {} },
			[`api repos/${REPO}/branches/main`]: { stdout: {} },
			[`api repos/${REPO}/branches/stage/protection/required_status_checks`]: {
				stdout: { contexts: ["Build & Type Check", "Commitlint"], checks: [{ context: "Unit Tests" }] },
			},
			[`api repos/${REPO}/rules/branches/main`]: {
				stdout: [
					{
						type: "required_status_checks",
						parameters: {
							required_status_checks: [
								{ context: "Build & Type Check" },
								{ context: "Commitlint" },
								{ context: "Unit Tests" },
							],
						},
					},
				],
			},
			"secret list --json name": { stdout: [{ name: "BACK_MERGE_TOKEN" }] },
		});
		const result = run(project, "doctor", { env });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /ok: stage requires Build & Type Check, Commitlint, Unit Tests/);
		assert.match(result.stdout, /ok: main requires/);
		assert.match(result.stderr, /warning: secret RELEASE_PLEASE_TOKEN is not set/);
	});

	it("fails on a missing branch and on required checks that do not match job names", () => {
		const env = stubGhCli({
			...repoView,
			[`api repos/${REPO}/branches/main`]: { stdout: {} },
			[`api repos/${REPO}/branches/main/protection/required_status_checks`]: { stdout: { contexts: ["build"] } },
		});
		const result = run(project, "doctor", { env });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /fail: branch stage does not exist/);
		assert.match(result.stderr, /fail: main does not require: Build & Type Check, Commitlint, Unit Tests/);
		assert.match(result.stderr, /cannot list secrets/);
	});

	it("fails when release-please has no token and Actions may not open PRs", () => {
		const env = stubGhCli({
			...repoView,
			"secret list --json name": { stdout: [{ name: "BACK_MERGE_TOKEN" }] },
			[`api repos/${REPO}/actions/permissions/workflow`]: {
				stdout: { default_workflow_permissions: "read", can_approve_pull_request_reviews: false },
			},
		});
		const result = run(project, "doctor", { env });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /fail: release-please cannot open its PR: set RELEASE_PLEASE_TOKEN/);
	});

	it("fails clearly without gh access", () => {
		const result = run(project, "doctor", { env: stubGhCli({}) });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /gh cannot read the repository/);
	});
});
