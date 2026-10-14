// Conventional Commits, enforced on `commit-msg` (Husky) and in CI
// (.github/workflows/commitlint.yml). The types match the ones release-please
// reads (release-please-config.json `changelog-sections`), plus `revert`.
// Scopes stay free-form, e.g. `feat(auth):`.
export default {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"type-enum": [
			2,
			"always",
			[
				"feat",
				"fix",
				"perf",
				"docs",
				"ci",
				"test",
				"refactor",
				"chore",
				"style",
				"build",
				"revert",
			],
		],
	},
};
