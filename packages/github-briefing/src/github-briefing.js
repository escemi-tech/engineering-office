import { Octokit } from "@octokit/rest";
import { z } from "zod";
import { CopilotTasks } from "./copilot-tasks.js";
import { PullRequests } from "./pull-requests.js";

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
	requests: 100,
	discoveryPages: 10,
	searchPages: 10,
	copilotPages: 10,
	pullIdentityPages: 10,
	durationMs: 120_000,
};

export class BriefingUnavailableError extends Error {}

export class GitHubBriefing {
	async collect({ policy, token }) {
		try {
			policy = policySchema.parse(policy);
			if (typeof token !== "string" || !/^[\x21-\x7e]{1,16384}$/u.test(token)) {
				throw new BriefingUnavailableError(
					"A valid explicit GitHub credential is required.",
				);
			}
			return await this.#collect(policy, token);
		} catch (error) {
			if (error instanceof BriefingUnavailableError) throw error;
			throw new BriefingUnavailableError(
				"Invalid source policy or GitHub response. No snapshot produced.",
			);
		}
	}

	async #collect(policy, token) {
		const { request, requestCount } = this.#requester(policy, token);
		const viewerResponse = await request("GET /user");
		if (viewerResponse.failure)
			throw new BriefingUnavailableError(
				"GitHub account verification unavailable. No snapshot produced.",
			);
		const viewer = identity.parse(viewerResponse.data);
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
				await this.#repository(
					request,
					approved,
					discovered.get(approved.id),
					viewer,
				),
			);
		}
		return {
			schemaVersion: 5,
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
					"team-review-requests",
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
		const deadline = Date.now() + limits.durationMs;
		const allowedPaths = new Set([
			"/user",
			"/user/repos",
			"/search/issues",
			...policy.repositories.map((repo) => `/repos/${repo.fullName}`),
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
					const allowedRead =
						options.method === "GET" &&
						(allowedPaths.has(target.pathname) || allowedTask(target.pathname));
					const allowedQuery =
						target.pathname === "/graphql" &&
						options.method === "POST" &&
						!target.search &&
						PullRequests.allows(options.body, policy.repositories);
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
					return { failure: stopped ?? "graphql-error" };
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

	async #repository(request, approved, found, viewer) {
		const result = { ...approved, status: "unavailable", items: [] };
		if (!found) {
			result.reason = "not-discovered";
			return result;
		}
		const matches = (repo) =>
			repo.id === approved.id &&
			repo.full_name === approved.fullName &&
			repo.private === (approved.visibility === "private");
		if (!matches(found)) {
			result.reason = "source-changed";
			return result;
		}
		const response = await request(`GET /repos/${approved.fullName}`);
		if (response.failure) {
			result.reason = response.failure;
			return result;
		}
		if (!matches(repositorySchema.parse(response.data))) {
			result.reason = "source-changed";
			return result;
		}
		result.searches = [];
		const items = new Map();
		for (const kind of ["issue", "pull-request"]) {
			for (const selection of ["work", "mentions"]) {
				const search = await this.#search(
					request,
					approved,
					viewer,
					kind,
					selection,
				);
				result.searches.push(search.coverage);
				if (
					["http-403", "http-404", "http-422"].includes(search.coverage.reason)
				) {
					return {
						...approved,
						status: "unavailable",
						reason: search.coverage.reason,
						items: [],
					};
				}
				for (const item of search.items) {
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
						(previous.updatedAt !== item.updatedAt ||
							previous.title !== item.title)
					) {
						search.coverage.status = "partial";
						search.coverage.reason = "changing-results";
						// Do not attach an older query's relevance to a different revision.
						items.set(
							item.issueId,
							Date.parse(previous.updatedAt) > Date.parse(item.updatedAt)
								? previous
								: item,
						);
					} else {
						items.set(item.issueId, {
							...item,
							reasons: [
								...new Set([...(previous?.reasons ?? []), ...item.reasons]),
							],
						});
					}
				}
			}
		}
		result.items = [...items.values()];
		if (
			new Set(result.items.map(({ kind, number }) => `${kind}:${number}`))
				.size !== items.size
		)
			throw new BriefingUnavailableError(
				"Inconsistent GitHub work identity. No snapshot produced.",
			);
		result.copilot = await new CopilotTasks().collect(
			request,
			approved,
			viewer,
			limits.copilotPages,
		);
		result.pullRequests = await new PullRequests().collect(
			request,
			approved,
			result.items,
			result.copilot.tasks,
			limits.pullIdentityPages,
		);
		// Metadata permissions are independent; recheck core access before retaining evidence.
		const verification = await request(`GET /repos/${approved.fullName}`);
		if (
			["http-403", "http-404"].includes(verification.failure) ||
			(!verification.failure &&
				!matches(repositorySchema.parse(verification.data)))
		) {
			return {
				...approved,
				status: "unavailable",
				reason: verification.failure ?? "source-changed",
				items: [],
			};
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

	async #search(request, approved, viewer, kind, selection) {
		const criteria = [`author:${viewer.login}`, `assignee:${viewer.login}`];
		if (kind === "pull-request")
			criteria.push(`review-requested:${viewer.login}`);
		const query = `repo:${approved.fullName} is:open is:${kind} ${selection === "mentions" ? `mentions:${viewer.login}` : `(${criteria.join(" OR ")})`}`;
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
				const url = `https://github.com/${approved.fullName}/${kind === "issue" ? "issues" : "pull"}/${item.number}`;
				const reasons = [];
				if (item.user?.id === viewer.id) reasons.push("authored");
				if (item.assignees.some(({ id }) => id === viewer.id))
					reasons.push("assigned");
				if (
					item.html_url !== url ||
					item.repository_url !==
						`https://api.github.com/repos/${approved.fullName}` ||
					Boolean(item.pull_request) !== (kind === "pull-request") ||
					(item.pull_request && item.pull_request.html_url !== url) ||
					Date.parse(item.updated_at) > Date.now() ||
					(selection === "work" && kind === "issue" && !reasons.length)
				) {
					throw new BriefingUnavailableError(
						"Inconsistent GitHub work evidence. No snapshot produced.",
					);
				}
				// Dedicated mentions queries avoid confusing mentions with review requests.
				if (selection === "mentions") reasons.push("mentioned");
				else if (!reasons.length) reasons.push("review-requested");
				if (items.has(item.id)) coverage.reason = "changing-results";
				items.set(item.id, {
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
