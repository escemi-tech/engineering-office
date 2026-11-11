import { Octokit } from "@octokit/rest";
import { z } from "zod";
import { CopilotTasks } from "./copilot-tasks.js";
import { PullRequests } from "./pull-requests.js";
import { RepositoryAccess } from "./repository-access.js";

const identity = z.object({
	id: z.int().positive(),
	login: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/u),
});
const fullName = z.string().regex(/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/u);
const admission = z.strictObject({
	id: z.int().positive(),
	fullName,
	visibility: z.enum(["public", "private"]),
});
const policySchema = z
	.strictObject({
		account: identity.strict(),
		scope: z
			.string()
			.regex(/^(professional-internal|personal|client:[a-z0-9-]+)$/u),
		repositories: z.array(admission).min(1).max(1000),
	})
	.refine(
		({ repositories }) =>
			new Set(repositories.map(({ id }) => id)).size === repositories.length &&
			new Set(repositories.map(({ fullName: name }) => name.toLowerCase()))
				.size === repositories.length,
	);
const repositorySchema = z
	.object({
		id: z.int().positive(),
		full_name: fullName,
		html_url: z.string(),
		private: z.boolean(),
	})
	.refine((repo) => repo.html_url === `https://github.com/${repo.full_name}`);
const itemSchema = z.object({
	id: z.int().positive(),
	number: z.int().positive(),
	title: z
		.string()
		.min(1)
		.max(1024)
		.refine((text) => text.isWellFormed()),
	html_url: z.string(),
	repository_url: z.string(),
	state: z.literal("open"),
	updated_at: z.iso.datetime(),
	user: z.object({ id: z.int().positive() }).nullable(),
	assignees: z.array(z.object({ id: z.int().positive() })),
	pull_request: z.object({ html_url: z.string() }).optional(),
});
const searchSchema = z.object({
	total_count: z.int().nonnegative(),
	incomplete_results: z.boolean(),
	items: z.array(itemSchema).max(100),
});
const limits = {
	requests: 2000,
	searchBatchSize: 20,
	repositoryRequests: 100,
	discoveryPages: 10,
	searchPages: 10,
	copilotPages: 10,
	pullIdentityPages: 10,
	durationMs: 900_000,
};

export class BriefingUnavailableError extends Error {}

export class GitHubBriefing {
	async collect({ policy, token }) {
		return this.#validated(token, () =>
			this.#collect(policySchema.parse(policy), token),
		);
	}

	async createPolicy({ token, scope, exclude = [] }) {
		return this.#validated(token, async () => {
			policySchema.shape.scope.parse(scope);
			const excluded = new Set(
				z
					.array(fullName)
					.max(1000)
					.parse(exclude)
					.map((name) => name.toLowerCase()),
			);
			const { request } = this.#requester({ repositories: [] }, token);
			const account = await this.#viewer(request);
			const { discovered, discovery } = await this.#discover(request);
			if (discovery.status !== "complete")
				throw new BriefingUnavailableError(
					"Repository discovery incomplete. No policy produced.",
				);
			const names = new Set(
				[...discovered.values()].map((repo) => repo.full_name.toLowerCase()),
			);
			if ([...excluded].some((name) => !names.has(name)))
				throw new BriefingUnavailableError(
					"An excluded repository was not discovered. Review its name and credential visibility. No policy produced.",
				);
			return policySchema.parse({
				account,
				scope,
				repositories: [...discovered.values()]
					.filter((repo) => !excluded.has(repo.full_name.toLowerCase()))
					.map((repo) => ({
						id: repo.id,
						fullName: repo.full_name,
						visibility: repo.private ? "private" : "public",
					})),
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

	async #viewer(request) {
		const response = await request("GET /user");
		if (response.failure)
			throw new BriefingUnavailableError(
				"GitHub account verification unavailable. No snapshot produced.",
			);
		return identity.parse(response.data);
	}

	async #collect(policy, token) {
		const { request, requestCount } = this.#requester(policy, token);
		const viewer = await this.#viewer(request);
		if (
			viewer.id !== policy.account.id ||
			viewer.login.toLowerCase() !== policy.account.login.toLowerCase()
		) {
			throw new BriefingUnavailableError(
				"GitHub account does not match the source policy. No snapshot produced.",
			);
		}

		const { discovered, discovery } = await this.#discover(request);

		const repositories = [];
		for (const approved of policy.repositories) {
			repositories.push(
				await this.#admit(request, approved, discovered.get(approved.id)),
			);
		}
		const ready = repositories.filter((repo) => repo.status === "pending");
		for (
			let offset = 0;
			offset < ready.length;
			offset += limits.searchBatchSize
		) {
			await this.#work(
				request,
				ready.slice(offset, offset + limits.searchBatchSize),
				viewer,
			);
		}
		for (const [index, result] of ready.entries()) {
			if (result.status === "unavailable") continue;
			// Reserve a task listing and final access check for every later repository.
			let remaining = Math.min(
				limits.repositoryRequests,
				Math.max(
					0,
					limits.requests - requestCount() - 2 * (ready.length - index - 1) - 1,
				),
			);
			const bounded = (...args) =>
				remaining-- > 0
					? request(...args)
					: Promise.resolve({ failure: "repository-budget" });
			await this.#enrich(bounded, request, result, viewer);
		}

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
				requests: requestCount(),
				limits: { ...limits },
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

	#requester(policy, token) {
		let requests = 0;
		let stopped;
		const resetTimes = new Map();
		const deadline = Date.now() + limits.durationMs;
		const allowedPaths = new Set([
			"/user",
			"/user/repos",
			"/search/issues",
			...policy.repositories.map(
				(repo) => `/agents/repos/${repo.fullName}/tasks`,
			),
		]);
		const allowedTask = (pathname) => {
			const separator = pathname.lastIndexOf("/");
			const collection = pathname.slice(0, separator);
			return (
				collection.startsWith("/agents/repos/") &&
				allowedPaths.has(collection) &&
				/^[a-zA-Z0-9_-]{1,128}$/u.test(pathname.slice(separator + 1))
			);
		};
		const client = new Octokit({
			auth: token,
			userAgent: "engineering-office-github-briefing",
			log: { debug() {}, info() {}, warn() {}, error() {} },
			request: {
				fetch: async (url, options) => {
					const target = new URL(url);
					const bucket = target.pathname.startsWith("/agents/")
						? "tasks"
						: target.pathname === "/search/issues"
							? "search"
							: target.pathname === "/graphql"
								? "graphql"
								: "core";
					const nextRequestAt = resetTimes.get(bucket) ?? 0;
					const allowedRead =
						options.method === "GET" &&
						(allowedPaths.has(target.pathname) || allowedTask(target.pathname));
					const allowedQuery =
						target.pathname === "/graphql" &&
						options.method === "POST" &&
						!target.search &&
						(JSON.parse(options.body).query === RepositoryAccess.query
							? RepositoryAccess
							: PullRequests
						).allows(options.body, policy.repositories);
					if (
						target.origin !== "https://api.github.com" ||
						target.username ||
						target.password ||
						(!allowedRead && !allowedQuery)
					) {
						throw new BriefingUnavailableError(
							"Request outside the GitHub source boundary.",
						);
					}
					if (
						!stopped &&
						requests < limits.requests &&
						Date.now() < deadline &&
						nextRequestAt > Date.now()
					) {
						if (nextRequestAt >= deadline) stopped = "rate-limit";
						else
							await new Promise((resolve) =>
								setTimeout(resolve, nextRequestAt - Date.now()),
							);
					}
					if (
						stopped ||
						requests >= limits.requests ||
						Date.now() >= deadline
					) {
						stopped ??= "request-budget";
						throw new BriefingUnavailableError(stopped);
					}
					requests++;
					const response = await fetch(url, {
						...options,
						redirect: "error",
						credentials: "omit",
						signal: AbortSignal.timeout(
							Math.max(1, Math.min(10_000, deadline - Date.now())),
						),
					});
					if (
						response.status === 429 ||
						(response.status === 403 &&
							(response.headers.has("retry-after") ||
								response.headers.get("x-ratelimit-remaining") === "0"))
					) {
						stopped = "rate-limit";
					}
					if (
						response.ok &&
						response.headers.get("x-ratelimit-remaining") === "0"
					) {
						const reset = Number(response.headers.get("x-ratelimit-reset"));
						if (Number.isSafeInteger(reset) && reset > 0)
							resetTimes.set(bucket, Math.max(Date.now(), reset * 1000) + 1000);
						else stopped = "rate-limit";
					}
					let bytes = 0;
					const body = response.body?.pipeThrough(
						new TransformStream({
							transform(chunk, controller) {
								bytes += chunk.byteLength;
								if (bytes > 4 * 1024 * 1024)
									throw new BriefingUnavailableError("response-size");
								controller.enqueue(chunk);
							},
						}),
					);
					return new Response(body, {
						status: response.status,
						statusText: response.statusText,
						headers: response.headers,
					});
				},
			},
		});
		const request = async (route, parameters = {}) => {
			try {
				const response = await client.request(route, {
					...parameters,
					headers: { "X-GitHub-Api-Version": "2026-03-10" },
				});
				if (route === "POST /graphql" && response.data.errors?.length) {
					const errors = z
						.array(z.object({ type: z.string().optional() }))
						.parse(response.data.errors);
					if (errors.some(({ type }) => type === "RATE_LIMITED"))
						stopped = "rate-limit";
					return {
						failure:
							stopped ??
							(errors.some(({ type }) => type === "FORBIDDEN")
								? "http-403"
								: errors.some(({ type }) => type === "NOT_FOUND")
									? "http-404"
									: "graphql-error"),
					};
				}
				return response;
			} catch (error) {
				if (error?.status === 401)
					throw new BriefingUnavailableError(
						"GitHub authentication failed. No snapshot produced.",
					);
				return {
					failure:
						stopped ??
						(Number.isInteger(error?.status)
							? `http-${error.status}`
							: "request-failed"),
				};
			}
		};
		return { request, requestCount: () => requests };
	}

	async #discover(request) {
		const discovered = new Map();
		let discovery = { status: "partial", reason: "page-limit" };
		for (let page = 1; page <= limits.discoveryPages; page++) {
			const response = await request("GET /user/repos", {
				visibility: "all",
				affiliation: "owner,collaborator,organization_member",
				sort: "full_name",
				direction: "asc",
				per_page: 100,
				page,
			});
			if (response.failure) {
				discovery.reason = response.failure;
				break;
			}
			const repositories = z
				.array(repositorySchema)
				.max(100)
				.parse(response.data);
			for (const repository of repositories) {
				if (discovered.has(repository.id))
					throw new BriefingUnavailableError(
						"Inconsistent GitHub repository discovery. No snapshot produced.",
					);
				discovered.set(repository.id, repository);
			}
			if (!(response.headers.link ?? "").includes('rel="next"')) {
				discovery = { status: "complete" };
				break;
			}
		}

		return { discovered, discovery };
	}

	#matches(approved, repo) {
		return (
			repo.id === approved.id &&
			repo.full_name === approved.fullName &&
			repo.private === (approved.visibility === "private")
		);
	}

	#unavailable(result, reason) {
		for (const key of ["searches", "copilot", "pullRequests", "access"])
			delete result[key];
		Object.assign(result, { status: "unavailable", reason, items: [] });
	}

	async #admit(request, approved, found) {
		const result = { ...approved, status: "unavailable", items: [] };
		if (!found) return { ...result, reason: "not-discovered" };
		if (!this.#matches(approved, found))
			return { ...result, reason: "source-changed" };
		const response = await new RepositoryAccess().read(request, approved);
		if (response.failure) return { ...result, reason: response.failure };
		if (!this.#matches(approved, repositorySchema.parse(response.data)))
			return { ...result, reason: "source-changed" };
		return { ...result, status: "pending", searches: [] };
	}

	async #work(request, repositories, viewer) {
		for (const kind of ["issue", "pull-request"]) {
			for (const selection of kind === "issue"
				? ["work", "mentions"]
				: ["work", "mentions", "reviews"]) {
				const active = repositories.filter(
					(repo) => repo.status !== "unavailable",
				);
				if (!active.length) return;
				const search = await this.#search(
					request,
					active,
					viewer,
					kind,
					selection,
				);
				if (
					active.length > 1 &&
					["http-403", "http-404", "http-422"].includes(search.coverage.reason)
				) {
					// A rejected batch cannot identify the inaccessible source; isolate these reads.
					for (const repo of active)
						this.#merge(
							repo,
							await this.#search(request, [repo], viewer, kind, selection),
						);
				} else for (const repo of active) this.#merge(repo, search);
			}
		}
	}

	#merge(result, search) {
		if (["http-403", "http-404", "http-422"].includes(search.coverage.reason)) {
			this.#unavailable(result, search.coverage.reason);
			return;
		}
		const selected = search.items.filter(
			(item) => item.repositoryId === result.id,
		);
		const { total, ...fields } = search.coverage;
		const coverage = { ...fields, matched: selected.length, batchTotal: total };
		result.searches.push(coverage);
		const items = new Map(result.items.map((item) => [item.issueId, item]));
		for (const { repositoryId, ...item } of selected) {
			const previous = items.get(item.issueId);
			if (
				previous &&
				(previous.kind !== item.kind || previous.number !== item.number)
			)
				throw new BriefingUnavailableError(
					"Inconsistent GitHub work identity. No snapshot produced.",
				);
			if (
				previous &&
				(previous.updatedAt !== item.updatedAt || previous.title !== item.title)
			) {
				coverage.status = "partial";
				coverage.reason = "changing-results";
				items.set(
					item.issueId,
					Date.parse(previous.updatedAt) > Date.parse(item.updatedAt)
						? previous
						: item,
				);
			} else
				items.set(item.issueId, {
					...item,
					reasons: [
						...new Set([...(previous?.reasons ?? []), ...item.reasons]),
					],
				});
		}
		result.items = [...items.values()];
		if (
			new Set(result.items.map(({ kind, number }) => `${kind}:${number}`))
				.size !== items.size
		)
			throw new BriefingUnavailableError(
				"Inconsistent GitHub work identity. No snapshot produced.",
			);
	}

	async #enrich(request, verify, result, viewer) {
		result.copilot = await new CopilotTasks().collect(
			request,
			result,
			viewer,
			limits.copilotPages,
		);
		result.pullRequests = await new PullRequests().collect(
			request,
			result,
			result.items,
			result.copilot.tasks,
			limits.pullIdentityPages,
		);
		// Metadata permissions are independent; recheck core access before retaining evidence.
		const verification = await new RepositoryAccess().read(verify, result);
		if (
			["http-403", "http-404"].includes(verification.failure) ||
			(!verification.failure &&
				!this.#matches(result, repositorySchema.parse(verification.data)))
		) {
			this.#unavailable(result, verification.failure ?? "source-changed");
			return;
		}
		result.access = verification.failure
			? { status: "unavailable", reason: verification.failure }
			: { status: "complete" };
		result.status =
			result.searches.every(({ status }) => status === "complete") &&
			result.copilot.status === "complete" &&
			result.pullRequests.status === "complete" &&
			result.access.status === "complete"
				? "complete"
				: "partial";
		return result;
	}

	async #search(request, repositories, viewer, kind, selection) {
		const criteria = {
			work: `(author:${viewer.login} OR assignee:${viewer.login})`,
			mentions: `mentions:${viewer.login}`,
			reviews: `review-requested:${viewer.login}`,
		};
		const names = repositories
			.map((repo) => `repo:${repo.fullName}`)
			.join(" OR ");
		const sourceQuery = repositories.length > 1 ? `(${names})` : names;
		const query = `${sourceQuery} is:open is:${kind} ${criteria[selection]}`;
		const coverage = {
			kind,
			selection,
			status: "partial",
			reason: "page-limit",
		};
		const items = new Map();
		for (let page = 1; page <= limits.searchPages; page++) {
			const response = await request("GET /search/issues", {
				q: query,
				advanced_search: "true",
				sort: "updated",
				order: "asc",
				per_page: 100,
				page,
			});
			if (response.failure) {
				coverage.reason = response.failure;
				break;
			}
			const data = searchSchema.parse(response.data);
			for (const item of data.items) {
				const approved = repositories.find(
					(repo) =>
						item.repository_url ===
						`https://api.github.com/repos/${repo.fullName}`,
				);
				if (!approved)
					throw new BriefingUnavailableError(
						"GitHub returned work outside the admitted search. No snapshot produced.",
					);
				const url = `https://github.com/${approved.fullName}/${kind === "issue" ? "issues" : "pull"}/${item.number}`;
				const reasons = [];
				if (item.user?.id === viewer.id) reasons.push("authored");
				if (item.assignees.some(({ id }) => id === viewer.id))
					reasons.push("assigned");
				// GitHub's author filter also matches PRs delegated to agents.
				// Preserve search attribution without claiming literal authorship.
				if (selection === "work" && kind === "pull-request" && !reasons.length)
					reasons.push("author-search");
				if (
					item.html_url !== url ||
					item.repository_url !==
						`https://api.github.com/repos/${approved.fullName}` ||
					Boolean(item.pull_request) !== (kind === "pull-request") ||
					(item.pull_request && item.pull_request.html_url !== url) ||
					Date.parse(item.updated_at) > Date.now() ||
					(selection === "work" && !reasons.length)
				) {
					throw new BriefingUnavailableError(
						"Inconsistent GitHub work evidence. No snapshot produced.",
					);
				}
				// Search-only relationships remain independent of authorship and assignment.
				if (selection === "mentions") reasons.push("mentioned");
				if (selection === "reviews") reasons.push("review-requested");
				if (items.has(item.id)) coverage.reason = "changing-results";
				items.set(item.id, {
					repositoryId: approved.id,
					issueId: item.id,
					number: item.number,
					kind,
					title: item.title,
					url,
					updatedAt: item.updated_at,
					reasons,
				});
			}
			if (
				items.size > data.total_count ||
				(coverage.total !== undefined && coverage.total !== data.total_count)
			) {
				coverage.reason = "changing-results";
			}
			coverage.total = data.total_count;
			if (data.incomplete_results) {
				coverage.reason = "incomplete-search";
				break;
			}
			if (coverage.reason === "changing-results") break;
			if (
				items.size >= data.total_count &&
				!(response.headers.link ?? "").includes('rel="next"')
			) {
				coverage.status = "complete";
				delete coverage.reason;
				break;
			}
			if (!data.items.length) {
				coverage.reason = "changing-results";
				break;
			}
		}
		return { coverage, items: [...items.values()] };
	}
}
