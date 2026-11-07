import { Octokit } from "@octokit/rest";
import { z } from "zod";
import source from "../source.json" with { type: "json" };

const repositoryName = `${source.owner}/${source.repository}`;
const repositoryUrl = `https://github.com/${repositoryName}`;
const apiPath = `/repos/${repositoryName}`;
const itemLimit = 20;
const repositorySchema = z.object({
	id: z.literal(source.repositoryId),
	full_name: z.literal(repositoryName),
	html_url: z.literal(repositoryUrl),
	private: z.literal(false),
});
const itemSchema = z
	.object({
		id: z.int().positive(),
		number: z.int().positive(),
		title: z
			.string()
			.min(1)
			.max(1024)
			.refine((text) => text.isWellFormed()),
		html_url: z.string(),
		state: z.literal("open"),
		updated_at: z.iso.datetime(),
		pull_request: z.object({ html_url: z.string() }).optional(),
	})
	.refine((item) => {
		const kind = item.pull_request ? "pull" : "issues";
		return (
			item.html_url === `${repositoryUrl}/${kind}/${item.number}` &&
			(!item.pull_request || item.pull_request.html_url === item.html_url)
		);
	});
const itemsSchema = z.array(itemSchema).max(itemLimit + 1);

export class BriefingUnavailableError extends Error {}

export class GitHubBriefing {
	async collect() {
		try {
			const client = new Octokit({
				userAgent: "engineering-office-github-briefing",
				request: { fetch: this.#fetch },
				log: { debug() {}, info() {}, warn() {}, error() {} },
			});
			const request = {
				owner: source.owner,
				repo: source.repository,
				headers: { "X-GitHub-Api-Version": "2026-03-10" },
			};
			const repository = repositorySchema.parse(
				(await client.rest.repos.get(request)).data,
			);
			const updatedSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
				.toISOString()
				.replace(/\.\d{3}Z$/u, "Z");
			const response = await client.rest.issues.listForRepo({
				...request,
				state: "open",
				sort: "updated",
				direction: "desc",
				since: updatedSince,
				per_page: itemLimit + 1,
				page: 1,
			});
			const items = itemsSchema.parse(response.data);
			const observedAt = new Date().toISOString();
			const revisions = items.map((item) => Date.parse(item.updated_at));
			if (
				new Set(items.map((item) => item.id)).size !== items.length ||
				new Set(items.map((item) => item.number)).size !== items.length ||
				revisions.some(
					(time, index) =>
						time < Date.parse(updatedSince) ||
						time > Date.parse(observedAt) ||
						(index > 0 && time > revisions[index - 1]),
				)
			) {
				throw new BriefingUnavailableError(
					"GitHub returned inconsistent source records.",
				);
			}

			return {
				schemaVersion: 1,
				scope: "professional-internal",
				classification: "public",
				source: {
					system: "github",
					repositoryId: repository.id,
					repository: repository.full_name,
					url: repository.html_url,
				},
				observedAt,
				coverage: {
					state: "open",
					updatedSince,
					limit: itemLimit,
					truncated:
						items.length > itemLimit ||
						(response.headers.link ?? "").includes('rel="next"'),
				},
				items: items.slice(0, itemLimit).map((item) => ({
					issueId: item.id,
					number: item.number,
					kind: item.pull_request ? "pull-request" : "issue",
					title: item.title,
					url: item.html_url,
					updatedAt: item.updated_at,
				})),
			};
		} catch (error) {
			if (error instanceof BriefingUnavailableError) throw error;
			if (error instanceof z.ZodError) {
				throw new BriefingUnavailableError(
					"GitHub returned data outside the approved public source contract.",
				);
			}
			const status = Number.isInteger(error?.status) ? error.status : null;
			throw new BriefingUnavailableError(
				status && status >= 400 && status <= 599
					? `GitHub source request failed (HTTP ${status}). No snapshot produced.`
					: "GitHub source unavailable. Check network access and request limits; no snapshot produced.",
			);
		}
	}

	async #fetch(url, options) {
		const target = new URL(url);
		if (
			target.origin !== "https://api.github.com" ||
			target.username ||
			target.password ||
			![apiPath, `${apiPath}/issues`].includes(target.pathname) ||
			options.method !== "GET" ||
			new Headers(options.headers).has("authorization")
		) {
			throw new BriefingUnavailableError(
				"Request outside the approved public source boundary.",
			);
		}
		const response = await fetch(url, {
			...options,
			redirect: "error",
			credentials: "omit",
			signal: AbortSignal.timeout(10_000),
		});
		let bytes = 0;
		const body = response.body?.pipeThrough(
			new TransformStream({
				transform(chunk, controller) {
					bytes += chunk.byteLength;
					if (bytes > 4 * 1024 * 1024) {
						throw new BriefingUnavailableError(
							"GitHub response exceeds the source size limit.",
						);
					}
					controller.enqueue(chunk);
				},
			}),
		);
		return new Response(body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	}
}
