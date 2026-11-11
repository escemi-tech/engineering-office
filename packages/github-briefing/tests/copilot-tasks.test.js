import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { GitHubBriefing } from "../src/github-briefing.js";
import { GitHubApiFixture } from "./helpers/github-api.js";

suite("Scoped Copilot work", () => {
	test("preserves branch identity and accepts zero sessions without inventing optional metadata", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		const pending = api.task(api.repositories[0], "pending", "queued");
		pending.session_count = 0;
		pending.sessions = [];
		pending.artifacts = [
			{
				provider: "github",
				type: "branch",
				data: { head_ref: "copilot/work", base_ref: "main" },
			},
		];
		for (const field of ["name", "html_url", "updated_at"])
			delete pending[field];
		api.tasks.set("work/project", [pending]);
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(snapshot.repositories[0].copilot.status, "complete");
		const evidence = snapshot.repositories[0].copilot.tasks[0];
		assert.deepEqual(evidence.artifacts, [
			{ type: "branch", headRef: "copilot/work", baseRef: "main" },
		]);
		assert.deepEqual(evidence.sessionCoverage, {
			status: "complete",
			expected: 0,
		});
		assert.equal(evidence.title, undefined);
		assert.equal(evidence.url, undefined);
		assert.equal(evidence.updatedAt, undefined);
	});

	test("retains every task state, PR identities and separate session attempts without raw content", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		const repo = api.repositories[0];
		const states = [
			"queued",
			"in_progress",
			"waiting_for_user",
			"failed",
			"timed_out",
			"completed",
			"idle",
			"cancelled",
		];
		const tasks = states.map((state, index) =>
			api.task(repo, `task-${index}`, state),
		);
		tasks[1].sessions = [
			api.session(repo, tasks[1].id, "old", "completed"),
			api.session(repo, tasks[1].id, "new", "in_progress"),
		];
		tasks[1].session_count = 2;
		tasks[1].artifacts = [
			{
				provider: "github",
				type: "pull",
				data: { id: 987654, global_id: "PR_synthetic" },
			},
		];
		api.tasks.set(repo.full_name, tasks);
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		const copilot = snapshot.repositories[0].copilot;
		assert.equal(copilot.status, "complete");
		assert.deepEqual(
			copilot.tasks.map((task) => task.state),
			states,
		);
		assert.deepEqual(
			copilot.tasks[1].sessions.map((session) => session.state),
			["completed", "in_progress"],
		);
		assert.deepEqual(copilot.tasks[1].artifacts, [
			{ type: "pull", id: 987654, globalId: "PR_synthetic" },
		]);
		assert.deepEqual(copilot.tasks[0].artifacts, []);
		assert.equal(copilot.tasks[1].sessionCoverage.status, "complete");
		assert.equal(copilot.tasks[1].url, tasks[1].html_url);
		assert.doesNotMatch(
			JSON.stringify(snapshot),
			/canary|mergeReady|pull\/987654/u,
		);
	});

	test("limits collection to admitted repositories and the verified task creator", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		api.policy.repositories.pop();
		api.tasks.set("work/project", [api.task(api.repositories[0])]);
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		const request = api.requests.find(({ url }) =>
			url.pathname.endsWith("/tasks"),
		);
		assert.equal(request.url.searchParams.get("creator_id"), "101");
		assert.equal(request.url.searchParams.get("is_archived"), "false");
		assert.equal(request.url.searchParams.has("since"), false);
		assert.equal(
			snapshot.repositories[0].copilot.boundary,
			"created-by-authenticated-user",
		);
		assert.ok(
			api.requests.every(
				({ url, body }) =>
					!url.href.includes("client") && !body?.includes("client"),
			),
		);
		assert.ok(
			snapshot.coverage.excluded.includes("copilot-tasks-created-by-others"),
		);
	});
});

suite("Copilot coverage and bounded reads", () => {
	test("follows page numbers without trusting supplied URLs or merging tasks on the same PR", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		const repo = api.repositories[0];
		const tasks = [api.task(repo, "first"), api.task(repo, "second")];
		for (const current of tasks)
			current.artifacts = [
				{ provider: "github", type: "pull", data: { id: 900 } },
			];
		api.tasks.set(repo.full_name, tasks);
		api.overrides.set("/agents/repos/work/project/tasks/1", {
			data: { tasks: [tasks[0]] },
			headers: { link: '<https://untrusted.invalid/canary>; rel="next"' },
		});
		api.overrides.set("/agents/repos/work/project/tasks/2", {
			data: { tasks: [tasks[1]] },
		});
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(snapshot.repositories[0].copilot.status, "complete");
		assert.deepEqual(
			snapshot.repositories[0].copilot.tasks.map((current) => current.id),
			["first", "second"],
		);
		assert.ok(
			api.requests.every(({ url }) => url.origin === "https://api.github.com"),
		);
	});

	for (const problem of ["page-limit", "changing-results", "unknown-creator"]) {
		test(`reports ${problem} without claiming complete task coverage`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const tasks = Array.from({ length: 10 }, (_, index) =>
				api.task(api.repositories[0], `task-${index}`),
			);
			api.tasks.set("work/project", tasks);
			for (let page = 1; page <= 10; page++) {
				const current = tasks[problem === "changing-results" ? 0 : page - 1];
				if (problem === "unknown-creator") delete current.creator;
				api.overrides.set(`/agents/repos/work/project/tasks/${page}`, {
					data: { tasks: [current] },
					headers: { link: '<https://api.github.com/ignored>; rel="next"' },
				});
			}
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			const { copilot } = snapshot.repositories[0];
			assert.equal(copilot.status, "partial");
			assert.equal(copilot.reason, problem);
			assert.equal(snapshot.coverage.status, "partial");
			assert.ok(
				api.requests.filter(({ url }) => url.pathname.endsWith("/tasks"))
					.length <= 11,
			);
			if (problem === "unknown-creator")
				assert.deepEqual(snapshot.repositories[0].copilot.tasks, []);
		});
	}

	test("shares the global request budget and exposes uncollected session detail", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		api.tasks.set(
			"work/project",
			Array.from({ length: 100 }, (_, index) =>
				api.task(api.repositories[0], `task-${index}`),
			),
		);
		api.overrides.set("/agents/repos/work/project/tasks/2", {
			data: { tasks: [] },
		});
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		const { copilot, access } = snapshot.repositories[0];
		assert.equal(access.reason, "request-budget");
		assert.equal(api.requests.length, 100);
		assert.equal(snapshot.coverage.status, "partial");
		assert.equal(copilot.reason, "request-budget");
		assert.equal(
			snapshot.repositories[0].copilot.tasks.at(-1).sessionCoverage.reason,
			"request-budget",
		);
		assert.equal(snapshot.repositories[1].reason, "request-budget");
	});

	for (const problem of [
		"http-403",
		"http-404",
		"http-422",
		"http-503",
		"rate-limit",
		"network-error",
	]) {
		test(`keeps accessible issue/PR evidence while making ${problem} task coverage explicit`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			let override = {
				status: Number(problem.slice(5)),
				data: { message: "synthetic-error-canary" },
			};
			if (problem === "rate-limit") override = { status: 429 };
			if (problem === "network-error")
				override = new Error("synthetic-error-canary");
			api.overrides.set("/agents/repos/work/project/tasks/1", override);
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			assert.equal(snapshot.repositories[0].copilot.status, "unavailable");
			assert.equal(snapshot.repositories[0].items.length, 2);
			assert.equal(snapshot.coverage.status, "partial");
			assert.doesNotMatch(JSON.stringify(snapshot), /canary/u);
			if (problem === "rate-limit") assert.equal(api.requests.length, 6);
		});
	}

	test("uses fresh task detail and preserves an ongoing retry after a completed session", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		const repo = api.repositories[0];
		const current = api.task(repo, "retry", "in_progress");
		current.updated_at = "2020-01-03T00:00:00Z";
		current.sessions = [
			api.session(repo, "retry", "finished", "completed"),
			api.session(repo, "retry", "running"),
		];
		current.session_count = 2;
		api.tasks.set(repo.full_name, [current]);
		api.overrides.set("/agents/repos/work/project/tasks/1", {
			data: {
				tasks: [
					{
						...current,
						state: "completed",
						updated_at: "2020-01-02T00:00:00Z",
					},
				],
			},
		});
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		const evidence = snapshot.repositories[0].copilot.tasks[0];
		assert.equal(evidence.state, "in_progress");
		assert.equal(evidence.updatedAt, current.updated_at);
		assert.equal(evidence.sessions.length, 2);
	});

	for (const problem of [
		"missing-sessions",
		"missing-count",
		"count-mismatch",
		"stale-detail",
		"failed-detail",
	]) {
		test(`reports ${problem} without inventing session completion`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const current = api.task(api.repositories[0]);
			api.tasks.set("work/project", [current]);
			const detail = structuredClone(current);
			if (problem === "missing-sessions") delete detail.sessions;
			if (problem === "missing-count") delete detail.session_count;
			if (problem === "count-mismatch") detail.session_count = 2;
			if (problem === "stale-detail") detail.updated_at = detail.created_at;
			api.overrides.set("/agents/repos/work/project/tasks/task-1", {
				data: detail,
				status: problem === "failed-detail" ? 503 : 200,
			});
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			assert.equal(snapshot.coverage.status, "partial");
			const evidence = snapshot.repositories[0].copilot.tasks[0];
			assert.notEqual(evidence.sessionCoverage.status, "complete");
			assert.equal(evidence.state, "in_progress");
			assert.doesNotMatch(JSON.stringify(snapshot), /canary/u);
		});
	}
});

suite("Copilot identity and access changes", () => {
	for (const problem of [
		"foreign-repository",
		"foreign-creator",
		"foreign-url",
		"unsafe-id",
		"unknown-state",
		"future-date",
		"archived",
		"foreign-session",
		"wrong-task",
		"duplicate-session",
		"wrong-detail-id",
		"oversized",
	]) {
		test(`rejects ${problem} without exposing response contents`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const current = api.task(api.repositories[0]);
			if (problem === "foreign-repository") current.repository.id = 999;
			if (problem === "foreign-creator") current.creator.id = 999;
			if (problem === "foreign-url")
				current.html_url = "https://untrusted.invalid/canary";
			if (problem === "unsafe-id") current.id = "../canary";
			if (problem === "unknown-state") current.state = "future-unknown-state";
			if (problem === "future-date")
				current.updated_at = "2099-01-01T00:00:00Z";
			if (problem === "archived") current.archived_at = current.updated_at;
			if (problem === "foreign-session")
				current.sessions[0].repository.id = 999;
			if (problem === "wrong-task") current.sessions[0].task_id = "other-task";
			if (problem === "duplicate-session")
				current.sessions.push(current.sessions[0]);
			if (problem === "oversized")
				api.overrides.set(
					"/agents/repos/work/project/tasks/1",
					new Response("x".repeat(4 * 1024 * 1024 + 1)),
				);
			if (problem === "wrong-detail-id")
				api.overrides.set("/agents/repos/work/project/tasks/task-1", {
					data: { ...current, id: "other-task" },
				});
			api.tasks.set("work/project", [current]);
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const result = api.collect(new GitHubBriefing());

			// Assert
			await assert.rejects(result, {
				message:
					"Invalid source policy or GitHub response. No snapshot produced.",
			});
			assert.ok(api.requests.every(({ url }) => !url.href.includes("canary")));
		});
	}

	for (const stage of ["list", "detail"]) {
		test(`discards the snapshot on credential revocation during ${stage}`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			api.tasks.set("work/project", [api.task(api.repositories[0])]);
			api.overrides.set(
				`/agents/repos/work/project/tasks/${stage === "list" ? "1" : "task-1"}`,
				{ status: 401 },
			);
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const result = api.collect(new GitHubBriefing());

			// Assert
			await assert.rejects(result, /authentication failed/u);
		});
	}

	for (const status of [403, 404]) {
		test(`discards Copilot metadata after task access returns ${status}`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			api.tasks.set("work/project", [
				api.task(api.repositories[0], "first"),
				api.task(api.repositories[0], "second"),
			]);
			api.overrides.set("/agents/repos/work/project/tasks/second", { status });
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			assert.deepEqual(snapshot.repositories[0].copilot.tasks, []);
			assert.equal(snapshot.repositories[0].copilot.status, "unavailable");
			assert.equal(snapshot.repositories[0].items.length, 2);
		});
	}

	for (const problem of ["revoked", "visibility-changed"]) {
		test(`discards all repository evidence when final access is ${problem}`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			api.tasks.set("work/project", [api.task(api.repositories[0])]);
			t.mock.method(globalThis, "fetch", async (url, options) => {
				const response = await api.fetch(url, options);
				if (new URL(url).pathname.endsWith("/tasks/task-1"))
					api.overrides.set("/repos/work/project", {
						status: problem === "revoked" ? 404 : 200,
						data: { ...api.repositories[0], private: true },
					});
				return response;
			});

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			assert.deepEqual(snapshot.repositories[0], {
				...api.policy.repositories[0],
				status: "unavailable",
				reason: problem === "revoked" ? "http-404" : "source-changed",
				items: [],
			});
		});
	}
});
