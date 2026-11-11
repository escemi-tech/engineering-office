import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { GitHubBriefing } from "../src/github-briefing.js";
import { PullRequests } from "../src/pull-requests.js";
import { GitHubApiFixture } from "./helpers/github-api.js";

suite("PR identity and independent context", () => {
	test("joins multiple tasks to one relevant PR without conflating completion, review and CI", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		const repo = api.repositories[0];
		const pull = api.pull(repo);
		pull.reviewDecision = "CHANGES_REQUESTED";
		pull.commits.nodes[0].commit.statusCheckRollup.state = "FAILURE";
		api.pulls.set(repo.full_name, [pull]);
		const tasks = [
			api.task(repo, "first", "completed"),
			api.task(repo, "second", "in_progress"),
		];
		for (const task of tasks)
			task.artifacts = [
				{
					provider: "github",
					type: "pull",
					data: { id: Number(pull.fullDatabaseId) },
				},
			];
		api.tasks.set(repo.full_name, tasks);
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		const evidence = snapshot.repositories[0];
		assert.equal(evidence.pullRequests.status, "complete");
		assert.equal(evidence.pullRequests.items.length, 1);
		const item = evidence.pullRequests.items[0];
		assert.deepEqual(item.taskIds, ["first", "second"]);
		assert.equal(item.resourceId, pull.fullDatabaseId);
		assert.notEqual(item.resourceId, String(evidence.items[1].issueId));
		assert.equal(item.reviewDecision, "CHANGES_REQUESTED");
		assert.equal(item.checks.state, "FAILURE");
		assert.equal(item.checks.headOid, item.headOid);
		assert.deepEqual(
			evidence.copilot.tasks.map(({ state }) => state),
			["completed", "in_progress"],
		);
		assert.ok(
			api.requests.every(
				({ body }) => !body?.includes("BriefingPullIdentities"),
			),
		);
		assert.doesNotMatch(JSON.stringify(snapshot), /mergeReady|canary/u);
	});

	test("resolves a task-only merged PR by resource identity across scoped pages", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		const repo = api.repositories[0];
		api.policy.repositories.pop();
		const pull = api.pull(repo, 42);
		pull.state = "MERGED";
		const task = api.task(repo);
		task.artifacts = [
			{
				provider: "github",
				type: "pull",
				data: {
					id: Number(pull.fullDatabaseId),
					global_id: "opaque-untrusted-id",
				},
			},
		];
		api.tasks.set(repo.full_name, [task]);
		api.pulls.set(repo.full_name, [api.pull(repo), pull]);
		api.overrides.set("work/project/resolve/start", {
			data: api.graphql(repo, {
				pullRequests: {
					nodes: [api.pull(repo)],
					pageInfo: { hasNextPage: true, endCursor: "opaque-cursor" },
				},
			}),
		});
		t.mock.method(globalThis, "fetch", api.fetch);
		api.overrides.set("work/project/resolve/opaque-cursor", {
			data: api.graphql(repo, {
				pullRequests: {
					nodes: [pull],
					pageInfo: { hasNextPage: false, endCursor: null },
				},
			}),
		});

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		const evidence = snapshot.repositories[0].pullRequests;
		assert.deepEqual(evidence.unresolvedArtifacts, []);
		assert.equal(evidence.items[1].number, 42);
		assert.equal(
			evidence.items[1].url,
			"https://github.com/work/project/pull/42",
		);
		assert.equal(evidence.items[1].state, "MERGED");
		assert.deepEqual(evidence.items[1].taskIds, [task.id]);
		const queries = api.requests.filter(
			({ method, body }) =>
				method === "POST" &&
				!JSON.parse(body).query.includes("BriefingRepositoryAccess"),
		);
		assert.equal(queries.length, 4);
		assert.ok(
			queries.every(
				({ url, body }) =>
					url.pathname === "/graphql" &&
					!/opaque-untrusted-id|client|mutation/u.test(body),
			),
		);
		assert.equal(JSON.parse(queries[2].body).variables.after, "opaque-cursor");
	});

	for (const state of [
		"ERROR",
		"EXPECTED",
		"FAILURE",
		"PENDING",
		"SUCCESS",
		null,
	]) {
		test(`preserves GitHub check rollup ${state} and unknown review without inferring readiness`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const repo = api.repositories[0];
			const pull = api.pull(repo);
			pull.reviewDecision = null;
			pull.isDraft = true;
			pull.commits.nodes[0].commit.statusCheckRollup = state ? { state } : null;
			api.pulls.set(repo.full_name, [pull]);
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			const evidence = snapshot.repositories[0].pullRequests.items[0];
			assert.equal(evidence.reviewDecision, null);
			assert.equal(evidence.draft, true);
			assert.deepEqual(evidence.checks, {
				status: "complete",
				headOid: pull.headRefOid,
				state,
			});
			assert.ok(snapshot.coverage.excluded.includes("merge-readiness"));
		});
	}

	for (const problem of ["head-changed", "head-unavailable"]) {
		test(`does not assign CI to the current head when ${problem}`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const repo = api.repositories[0];
			const pull = api.pull(repo);
			if (problem === "head-changed")
				pull.commits.nodes[0].commit.oid = "b".repeat(40);
			else pull.commits.nodes = [];
			api.pulls.set(repo.full_name, [pull]);
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			const result = snapshot.repositories[0];
			assert.equal(result.status, "partial");
			assert.equal(
				result.pullRequests.items[0].reviewDecision,
				"REVIEW_REQUIRED",
			);
			assert.deepEqual(result.pullRequests.items[0].checks, {
				status: "unavailable",
				reason: problem,
			});
		});
	}
});

suite("Bounded context failures", () => {
	for (const number of [1, 42]) {
		test(`rejects a conflicting resource ID for PR ${number}`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const repo = api.repositories[0];
			const task = api.task(repo, "conflicting-link");
			task.artifacts = [
				{ provider: "github", type: "pull", data: { id: 999999 } },
			];
			api.tasks.set(repo.full_name, [task]);
			api.pulls.set(repo.full_name, [api.pull(repo), api.pull(repo, 42)]);
			api.overrides.set("work/project/resolve/start", {
				data: api.graphql(repo, {
					pullRequests: {
						nodes: [{ fullDatabaseId: "999999", number }],
						pageInfo: { hasNextPage: false, endCursor: null },
					},
				}),
			});
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act / Assert
			await assert.rejects(api.collect(new GitHubBriefing()), {
				message:
					"Invalid source policy or GitHub response. No snapshot produced.",
			});
		});
	}

	for (const failure of [403, 404, 500, "graphql", "rate-limit", "null"]) {
		test(`reports ${failure} without discarding accessible issue and task evidence or leaking errors`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const repo = api.repositories[0];
			api.tasks.set(repo.full_name, [api.task(repo)]);
			let response = {
				status: failure,
				data: { message: "private-error-canary" },
			};
			if (failure === "graphql" || failure === "rate-limit")
				response = {
					data: {
						...api.graphql(repo, { pullRequest: api.pull(repo) }),
						errors: [
							{
								type: failure === "rate-limit" ? "RATE_LIMITED" : "FORBIDDEN",
								message: "private-error-canary",
							},
						],
					},
				};
			if (failure === "null")
				response = { data: api.graphql(repo, { pullRequest: null }) };
			api.overrides.set("work/project/context/1", response);
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			const result = snapshot.repositories[0];
			assert.equal(result.items.length, 2);
			assert.equal(result.copilot.tasks.length, 1);
			assert.equal(result.pullRequests.status, "partial");
			assert.equal(result.pullRequests.items[0].status, "unavailable");
			assert.equal(result.pullRequests.items[0].reviewDecision, undefined);
			assert.doesNotMatch(JSON.stringify(snapshot), /canary/u);
			if (failure === "rate-limit") {
				assert.equal(api.requests.length, 12);
				assert.equal(result.access.reason, "rate-limit");
			}
		});
	}

	for (const problem of [
		"missing",
		"page-limit",
		"repeated-cursor",
		"empty-page",
	]) {
		test(`retains unresolved artifacts when lookup is ${problem}`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const repo = api.repositories[0];
			const task = api.task(repo);
			task.artifacts = [
				{ provider: "github", type: "pull", data: { id: 999999 } },
			];
			api.tasks.set(repo.full_name, [task]);
			if (problem !== "missing") {
				for (let page = 0; page < 10; page++)
					api.overrides.set(
						`work/project/resolve/${page ? `page-${page}` : "start"}`,
						{
							data: api.graphql(repo, {
								pullRequests: {
									nodes:
										problem === "empty-page" ? [] : [api.pull(repo, page + 10)],
									pageInfo: {
										hasNextPage: true,
										endCursor:
											problem === "repeated-cursor"
												? "page-1"
												: `page-${page + 1}`,
									},
								},
							}),
						},
					);
			}
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			const result = snapshot.repositories[0].pullRequests;
			assert.equal(result.status, "partial");
			assert.deepEqual(result.unresolvedArtifacts, [
				{
					resourceId: "999999",
					taskIds: [task.id],
					reason:
						problem === "missing"
							? "not-found"
							: problem === "page-limit"
								? "page-limit"
								: "changing-results",
				},
			]);
			assert.equal(result.items.length, 1);
			assert.doesNotMatch(JSON.stringify(result), /pull\/999999/u);
		});
	}

	for (const problem of [
		"repository",
		"visibility",
		"number",
		"url",
		"future",
		"malformed-state",
		"authentication",
	]) {
		test(`rejects ${problem} with a sanitized failure and no snapshot`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const repo = api.repositories[0];
			const pull = api.pull(repo);
			const data = api.graphql(repo, { pullRequest: pull });
			if (problem === "repository") data.data.repository.databaseId = 999;
			if (problem === "visibility") data.data.repository.isPrivate = true;
			if (problem === "number") pull.number = 10;
			if (problem === "url")
				pull.url = "https://untrusted.invalid/private-canary";
			if (problem === "future") pull.updatedAt = "2099-01-01T00:00:00Z";
			if (problem === "malformed-state") pull.reviewDecision = "private-canary";
			api.overrides.set("work/project/context/1", {
				data,
				status: problem === "authentication" ? 401 : 200,
			});
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act / Assert
			await assert.rejects(api.collect(new GitHubBriefing()), (error) => {
				assert.match(error.message, /No snapshot produced/u);
				assert.doesNotMatch(error.message, /canary|untrusted/u);
				return true;
			});
		});
	}
});

suite("Fixed read-only GraphQL boundary", () => {
	for (const problem of [
		"mutation",
		"foreign-repository",
		"extra-variable",
		"injected-number",
		"extra-field",
	]) {
		test(`rejects ${problem} before any HTTP request`, () => {
			// Arrange
			const admissions = [{ fullName: "work/project" }];
			const body = {
				query: PullRequests.queries.context,
				variables: { owner: "work", name: "project", number: 1 },
			};
			if (problem === "mutation") body.query = "mutation { privateCanary }";
			if (problem === "foreign-repository") body.variables.owner = "client";
			if (problem === "extra-variable") body.variables.token = "private-canary";
			if (problem === "injected-number")
				body.variables.number = "1) { privateCanary }";
			if (problem === "extra-field") body.operationName = "privateCanary";

			// Act / Assert
			if (problem === "foreign-repository")
				assert.equal(
					PullRequests.allows(JSON.stringify(body), admissions),
					false,
				);
			else
				assert.throws(() =>
					PullRequests.allows(JSON.stringify(body), admissions),
				);
		});
	}
});
