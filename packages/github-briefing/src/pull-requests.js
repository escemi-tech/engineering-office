import { z } from "zod";

const resourceId = z
	.string()
	.regex(/^[1-9][0-9]{0,18}$/u)
	.nullable();
const number = z.int().positive().max(2_147_483_647);
const cursor = z.string().min(1).max(1024).nullable();
const identity = z.object({ fullDatabaseId: resourceId, number });
const repositoryIdentity = z.object({
	databaseId: z.int().positive(),
	nameWithOwner: z.string(),
	isPrivate: z.boolean(),
});
const oid = z.string().regex(/^[a-f0-9]{40}$/u);
const context = identity.extend({
	url: z.string(),
	title: z
		.string()
		.min(1)
		.max(1024)
		.refine((value) => value.isWellFormed()),
	state: z.enum(["OPEN", "CLOSED", "MERGED"]),
	isDraft: z.boolean(),
	updatedAt: z.iso
		.datetime()
		.refine((value) => Date.parse(value) <= Date.now()),
	headRefOid: oid,
	reviewDecision: z
		.enum(["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED"])
		.nullable(),
	commits: z.object({
		nodes: z
			.array(
				z.object({
					commit: z.object({
						oid,
						statusCheckRollup: z
							.object({
								state: z.enum([
									"ERROR",
									"EXPECTED",
									"FAILURE",
									"PENDING",
									"SUCCESS",
								]),
							})
							.nullable(),
					}),
				}),
			)
			.max(1),
	}),
});

export class PullRequests {
	static queries = Object.freeze({
		context: `query BriefingPullRequest($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    databaseId nameWithOwner isPrivate
    pullRequest(number: $number) {
      fullDatabaseId number url title state isDraft updatedAt headRefOid reviewDecision
      commits(last: 1) { nodes { commit { oid statusCheckRollup { state } } } }
    }
  }
}`,
		resolve: `query BriefingPullIdentities($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    databaseId nameWithOwner isPrivate
    pullRequests(first: 100, after: $after, states: [OPEN, CLOSED, MERGED], orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { fullDatabaseId number }
      pageInfo { hasNextPage endCursor }
    }
  }
}`,
	});

	static allows(body, admissions) {
		const { query, variables } = z
			.strictObject({
				query: z.enum(Object.values(PullRequests.queries)),
				variables: z.unknown(),
			})
			.parse(JSON.parse(body));
		const source = { owner: z.string(), name: z.string() };
		const values = z
			.strictObject(
				query === PullRequests.queries.context
					? { ...source, number }
					: { ...source, after: cursor },
			)
			.parse(variables);
		return admissions.some(
			(repo) => repo.fullName === `${values.owner}/${values.name}`,
		);
	}

	async collect(request, repository, work, tasks, pageLimit) {
		const pending = new Map();
		for (const task of tasks) {
			for (const artifact of task.artifacts ?? []) {
				if (artifact.type !== "pull") continue;
				const key = String(artifact.id);
				if (!pending.has(key)) pending.set(key, new Set());
				pending.get(key).add(task.id);
			}
		}
		const items = new Map();
		for (const item of work.filter(({ kind }) => kind === "pull-request")) {
			const evidence = await this.#context(request, repository, item.number);
			items.set(item.number, evidence);
			this.#link(evidence, pending);
		}
		const reason = pending.size
			? await this.#resolve(request, repository, pending, items, pageLimit)
			: undefined;
		return {
			status:
				!pending.size &&
				[...items.values()].every((item) => item.status === "complete")
					? "complete"
					: "partial",
			items: [...items.values()],
			unresolvedArtifacts: [...pending].map(([id, taskIds]) => ({
				resourceId: id,
				taskIds: [...taskIds],
				reason,
			})),
		};
	}

	#link(evidence, pending) {
		evidence.taskIds = [...(pending.get(evidence.resourceId) ?? [])];
		pending.delete(evidence.resourceId);
	}

	async #resolve(request, repository, pending, items, pageLimit) {
		let after = null;
		const seenCursors = new Set();
		const seenIds = new Set();
		for (let page = 0; page < pageLimit; page++) {
			const response = await this.#read(request, repository, "resolve", {
				after,
			});
			if (response.failure) return response.failure;
			const connection = z
				.object({
					nodes: z.array(identity).max(100),
					pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: cursor }),
				})
				.parse(response.data.pullRequests);
			for (const candidate of connection.nodes) {
				if (!candidate.fullDatabaseId) continue;
				if (seenIds.has(candidate.fullDatabaseId)) return "changing-results";
				seenIds.add(candidate.fullDatabaseId);
				if (!pending.has(candidate.fullDatabaseId)) continue;
				let evidence = items.get(candidate.number);
				if (
					evidence?.resourceId &&
					evidence.resourceId !== candidate.fullDatabaseId
				)
					throw new Error("Inconsistent pull request identity");
				if (!evidence) {
					evidence = await this.#context(
						request,
						repository,
						candidate.number,
						candidate.fullDatabaseId,
					);
					items.set(candidate.number, evidence);
				} else evidence.resourceId = candidate.fullDatabaseId;
				this.#link(evidence, pending);
			}
			if (!pending.size) return;
			if (!connection.pageInfo.hasNextPage) return "not-found";
			after = connection.pageInfo.endCursor;
			if (!after || !connection.nodes.length || seenCursors.has(after))
				return "changing-results";
			seenCursors.add(after);
		}
		return "page-limit";
	}

	async #read(request, repository, operation, parameters) {
		const [owner, name] = repository.fullName.split("/");
		const response = await request("POST /graphql", {
			query: PullRequests.queries[operation],
			variables: { owner, name, ...parameters },
		});
		if (response.failure) return response;
		const envelope = z
			.object({
				data: z.object({ repository: z.looseObject({}).nullable() }),
			})
			.parse(response.data);
		if (!envelope.data.repository) return { failure: "not-accessible" };
		const current = repositoryIdentity.parse(envelope.data.repository);
		if (
			current.databaseId !== repository.id ||
			current.nameWithOwner !== repository.fullName ||
			current.isPrivate !== (repository.visibility === "private")
		)
			throw new Error("Inconsistent pull request repository");
		return { data: envelope.data.repository };
	}

	async #context(request, repository, pullNumber, expectedId) {
		const evidence = {
			number: pullNumber,
			url: `https://github.com/${repository.fullName}/pull/${pullNumber}`,
			resourceId: expectedId,
			status: "unavailable",
			taskIds: [],
		};
		const response = await this.#read(request, repository, "context", {
			number: pullNumber,
		});
		if (response.failure) return { ...evidence, reason: response.failure };
		if (response.data.pullRequest === null)
			return { ...evidence, reason: "not-accessible" };
		const current = context.parse(response.data.pullRequest);
		if (
			current.number !== pullNumber ||
			current.url !== evidence.url ||
			(expectedId && current.fullDatabaseId !== expectedId)
		)
			throw new Error("Inconsistent pull request context");
		const commit = current.commits.nodes[0]?.commit;
		const checks =
			commit?.oid === current.headRefOid
				? {
						status: "complete",
						headOid: commit.oid,
						state: commit.statusCheckRollup?.state ?? null,
					}
				: {
						status: "unavailable",
						reason: commit ? "head-changed" : "head-unavailable",
					};
		return {
			...evidence,
			resourceId: current.fullDatabaseId,
			status: checks.status === "complete" ? "complete" : "partial",
			title: current.title,
			state: current.state,
			draft: current.isDraft,
			updatedAt: current.updatedAt,
			headOid: current.headRefOid,
			reviewDecision: current.reviewDecision,
			checks,
		};
	}
}
