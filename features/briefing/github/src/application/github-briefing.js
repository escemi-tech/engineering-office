import {
	BriefingUnavailableError,
	SourcePolicy,
} from "../domain/source-policy.js";

const sourcePolicy = new SourcePolicy();

/**
 * Source port: openSource(policy, token) returns viewer(), discover(),
 * collectRepositories(policy, viewer, discovered), requests and limits.
 * Discovery exposes admitted-policy fields, never SDK response objects.
 */
export class GitHubBriefing {
	#openSource;
	constructor(openSource) {
		this.#openSource = openSource;
	}

	async collect({ policy, token }) {
		return this.#validated(token, () =>
			this.#collect(sourcePolicy.parse(policy), token),
		);
	}

	async createPolicy({ token, scope, exclude = [] }) {
		return this.#validated(token, async () => {
			const excluded = sourcePolicy.exclusions(scope, exclude);
			const source = this.#openSource({ repositories: [] }, token);
			const account = await source.viewer();
			const { discovered, discovery } = await source.discover();
			if (discovery.status !== "complete")
				throw new BriefingUnavailableError(
					"Repository discovery incomplete. No policy produced.",
				);
			const names = new Set(
				[...discovered.values()].map((repo) => repo.fullName.toLowerCase()),
			);
			if ([...excluded].some((name) => !names.has(name)))
				throw new BriefingUnavailableError(
					"An excluded repository was not discovered. Review its name and credential visibility. No policy produced.",
				);
			return sourcePolicy.parse({
				account,
				scope,
				repositories: [...discovered.values()].filter(
					(repo) => !excluded.has(repo.fullName.toLowerCase()),
				),
			});
		});
	}

	async #validated(token, operation) {
		try {
			if (typeof token !== "string" || !/^[\x21-\x7e]{1,16384}$/u.test(token)) {
				throw new BriefingUnavailableError(
					"A valid explicit GitHub credential is required.",
				);
			}
			return await operation();
		} catch (error) {
			if (error instanceof BriefingUnavailableError) throw error;
			throw new BriefingUnavailableError(
				"Invalid source policy or GitHub response. No snapshot produced.",
			);
		}
	}

	async #collect(policy, token) {
		const source = this.#openSource(policy, token);
		const viewer = await source.viewer();
		if (
			viewer.id !== policy.account.id ||
			viewer.login.toLowerCase() !== policy.account.login.toLowerCase()
		) {
			throw new BriefingUnavailableError(
				"GitHub account does not match the source policy. No snapshot produced.",
			);
		}

		const { discovered, discovery } = await source.discover();
		const repositories = await source.collectRepositories(
			policy,
			viewer,
			discovered,
		);

		return {
			schemaVersion: 8,
			scope: policy.scope,
			classification: "restricted",
			source: { system: "github", account: viewer },
			observedAt: new Date().toISOString(),
			coverage: {
				boundary: "credential-visible-repositories",
				discovery,
				discoveredRepositories: discovered.size,
				unadmittedRepositories: [...discovered.keys()].filter(
					(id) => !policy.repositories.some((repo) => repo.id === id),
				).length,
				status:
					discovery.status === "complete" &&
					repositories.every(({ status }) => status === "complete")
						? "complete"
						: "partial",
				requests: source.requests,
				limits: source.limits,
				excluded: [
					"team-mentions",
					"copilot-tasks-created-by-others",
					"archived-copilot-tasks",
					"local-agent-activity",
					"closed-issues",
					"closed-pull-requests-without-copilot-task",
					"merge-readiness",
				],
			},
			repositories,
		};
	}
}
