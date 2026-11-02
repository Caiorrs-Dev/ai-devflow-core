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
				stdout: {
					contexts: ["Build & Type Check", "Commitlint"],
					checks: [{ context: "Unit Tests" }, { context: "AI-flow Check" }, { context: "Security Scan" }],
				},
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
								{ context: "AI-flow Check" }, { context: "Security Scan" },
							],
						},
					},
				],
			},
			"secret list --json name": { stdout: [{ name: "BACK_MERGE_TOKEN" }] },
			[`api repos/${REPO}/actions/organization-secrets`]: { stdout: { total_count: 0, secrets: [] } },
		});
		const result = run(project, "doctor", { env });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /ok: stage requires Build & Type Check, Commitlint, AI-flow Check, Security Scan, Unit Tests/);
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
		assert.match(
			result.stderr,
			/fail: main does not require: Build & Type Check, Commitlint, AI-flow Check, Security Scan, Unit Tests/,
		);
		assert.match(result.stderr, /cannot list secrets/);
	});

	it("fails when release-please has no token and Actions may not open PRs", () => {
		const env = stubGhCli({
			...repoView,
			"secret list --json name": { stdout: [{ name: "BACK_MERGE_TOKEN" }] },
			[`api repos/${REPO}/actions/organization-secrets`]: { stdout: { total_count: 0, secrets: [] } },
			[`api repos/${REPO}/actions/permissions/workflow`]: {
				stdout: { default_workflow_permissions: "read", can_approve_pull_request_reviews: false },
			},
		});
		const result = run(project, "doctor", { env });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /fail: release-please cannot open its PR: set RELEASE_PLEASE_TOKEN/);
	});

	it("counts organization secrets shared with the repository", () => {
		const env = stubGhCli({
			...repoView,
			"secret list --json name": { stdout: [] },
			[`api repos/${REPO}/actions/organization-secrets`]: {
				stdout: { total_count: 2, secrets: [{ name: "BACK_MERGE_TOKEN" }, { name: "RELEASE_PLEASE_TOKEN" }] },
			},
		});
		const result = run(project, "doctor", { env });
		assert.match(result.stdout, /ok: secret BACK_MERGE_TOKEN/);
		assert.match(result.stdout, /ok: secret RELEASE_PLEASE_TOKEN/);
		assert.doesNotMatch(result.stderr, /release-please cannot open/);
	});

	it("does not call a secret missing when organization secrets cannot be read", () => {
		const env = stubGhCli({
			...repoView,
			"secret list --json name": { stdout: [{ name: "BACK_MERGE_TOKEN" }] },
			[`api repos/${REPO}/actions/permissions/workflow`]: {
				stdout: { default_workflow_permissions: "read", can_approve_pull_request_reviews: false },
			},
		});
		const result = run(project, "doctor", { env });
		assert.match(
			result.stderr,
			/warning: secret RELEASE_PLEASE_TOKEN is not a repository secret \(organization secrets could not be read: HTTP 404/,
		);
		assert.doesNotMatch(result.stderr, /is not set|release-please cannot open/);
	});

	it("fails clearly without gh access", () => {
		const result = run(project, "doctor", { env: stubGhCli({}) });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /gh cannot read the repository/);
	});
});
