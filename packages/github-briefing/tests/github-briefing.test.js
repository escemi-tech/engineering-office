import assert from "node:assert/strict";
import { suite, test } from "node:test";
import {
	BriefingUnavailableError,
	GitHubBriefing,
} from "../src/github-briefing.js";
import { GitHubApiFixture } from "./helpers/github-api.js";

suite("Account-wide scoped evidence", () => {
	test("discovers across owners and retains old unresolved work with minimal provenance", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(snapshot.schemaVersion, 2);
		assert.equal(snapshot.scope, "professional-internal");
		assert.equal(snapshot.classification, "restricted");
		assert.deepEqual(snapshot.source.account, api.viewer);
		assert.equal(snapshot.coverage.status, "complete");
		assert.equal(snapshot.repositories.length, 2);
		for (const [index, repository] of snapshot.repositories.entries()) {
			assert.equal(repository.id, api.repositories[index].id);
			assert.equal(repository.status, "complete");
			assert.equal(repository.items.length, 2);
			assert.equal(repository.items[0].updatedAt, "2020-01-01T00:00:00Z");
			assert.equal(
				repository.items[0].title,
				api.item(api.repositories[index], "issue").title,
			);
			assert.deepEqual(repository.items[0].reasons, ["authored"]);
		}
		assert.doesNotMatch(
			JSON.stringify(snapshot),
			/canary|assignees|repository_url/u,
		);
		assert.ok(Date.parse(snapshot.observedAt) <= Date.now());
	});

	test("bounds authenticated requests and uses separate, repository-scoped relevance queries", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(api.requests.length, 8);
		const discovery = api.requests[1].url.searchParams;
		assert.equal(
			discovery.get("affiliation"),
			"owner,collaborator,organization_member",
		);
		assert.equal(discovery.get("visibility"), "all");
		for (const request of api.requests) {
			assert.equal(request.url.origin, "https://api.github.com");
			assert.equal(request.method, "GET");
			assert.equal(request.redirect, "error");
			assert.equal(request.credentials, "omit");
			assert.ok(request.signal instanceof AbortSignal);
			assert.equal(
				new Headers(request.headers).get("authorization"),
				"token synthetic-token-canary",
			);
			assert.equal(
				new Headers(request.headers).get("x-github-api-version"),
				"2026-03-10",
			);
			if (request.url.pathname !== "/search/issues") continue;
			const query = request.url.searchParams.get("q");
			assert.match(
				query,
				/^repo:(work|client)\/project is:open is:(issue|pull-request) \(author:example-user OR assignee:example-user/u,
			);
			assert.equal(
				query.includes("review-requested:"),
				query.includes("is:pull-request"),
			);
			assert.doesNotMatch(query, /updated:|created:|since:/u);
			assert.equal(request.url.searchParams.get("advanced_search"), "true");
			assert.equal(request.url.searchParams.get("order"), "asc");
		}
	});

	for (const relation of ["assigned", "review-requested"]) {
		test(`includes ${relation} work without authorship`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const item = api.item(api.repositories[0], "pull-request");
			item.user = { id: 505, login: "dependabot[bot]" };
			if (relation === "assigned") item.assignees = [api.viewer];
			api.overrides.set("work/project/pull-request/1", {
				data: { total_count: 1, incomplete_results: false, items: [item] },
			});
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			assert.deepEqual(snapshot.repositories[0].items[1].reasons, [relation]);
		});
	}

	test("does not collect or expose identities of sources outside the selected scope", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		api.policy.repositories.pop();
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(snapshot.coverage.discoveredRepositories, 2);
		assert.equal(snapshot.coverage.unadmittedRepositories, 1);
		assert.doesNotMatch(JSON.stringify(snapshot), /client\/project/u);
		assert.ok(api.requests.every(({ url }) => !url.href.includes("client")));
	});

	test("paginates discovery with locally constructed URLs", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		api.overrides.set("/user/repos/1", {
			data: [api.repositories[0]],
			headers: { link: '<https://untrusted.invalid>; rel="next"' },
		});
		api.overrides.set("/user/repos/2", { data: [api.repositories[1]] });
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(snapshot.coverage.discovery.status, "complete");
		assert.equal(snapshot.coverage.discoveredRepositories, 2);
		assert.ok(
			api.requests.every(({ url }) => url.hostname === "api.github.com"),
		);
	});
});

suite("Admission and credentials", () => {
	for (const problem of [
		"wrong-account",
		"duplicate-policy",
		"query-injection",
		"unknown-policy-field",
		"missing-token",
	]) {
		test(`rejects ${problem} before source collection`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			let token = "synthetic-token-canary";
			if (problem === "wrong-account")
				api.policy.account = { ...api.viewer, id: 999 };
			if (problem === "duplicate-policy")
				api.policy.repositories.push(api.policy.repositories[0]);
			if (problem === "query-injection")
				api.policy.repositories[0].fullName =
					"work/project OR repo:secret/work";
			if (problem === "unknown-policy-field")
				api.policy.processor = "unapproved";
			if (problem === "missing-token") token = undefined;
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const result = new GitHubBriefing().collect({
				policy: api.policy,
				token,
			});

			// Assert
			await assert.rejects(result, BriefingUnavailableError);
			assert.ok(api.requests.length <= 1);
		});
	}

	for (const problem of [
		"renamed",
		"visibility-changed",
		"replaced",
		"access-revoked",
	]) {
		test(`reports ${problem} without fetching that repository's work`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const repository = { ...api.repositories[0] };
			if (problem === "renamed") {
				repository.full_name = "work/renamed";
				repository.html_url = "https://github.com/work/renamed";
			}
			if (problem === "visibility-changed") repository.private = true;
			if (problem === "replaced") repository.id = 999;
			api.overrides.set("/repos/work/project", {
				data: repository,
				status: problem === "access-revoked" ? 404 : 200,
			});
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			assert.equal(snapshot.repositories[0].status, "unavailable");
			assert.deepEqual(snapshot.repositories[0].items, []);
			assert.equal(snapshot.coverage.status, "partial");
			assert.ok(
				api.requests.every(
					({ url }) =>
						!url.searchParams.get("q")?.startsWith("repo:work/project "),
				),
			);
		});
	}

	test("does not reuse a repository that disappeared from discovery on a subsequent run", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		const collector = new GitHubBriefing();
		t.mock.method(globalThis, "fetch", api.fetch);
		await api.collect(collector);
		api.overrides.set("/user/repos/1", { data: [api.repositories[1]] });

		// Act
		const snapshot = await api.collect(collector);

		// Assert
		assert.equal(snapshot.repositories[0].reason, "not-discovered");
		assert.deepEqual(snapshot.repositories[0].items, []);
	});
});

suite("Partial coverage and failed sources", () => {
	for (const problem of [
		"incomplete-search",
		"changing-results",
		"http-503",
		"rate-limit",
	]) {
		test(`makes ${problem} visible without claiming an empty backlog`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const item = api.item(api.repositories[0], "issue");
			let override = {
				data: {
					total_count: 2,
					incomplete_results: problem === "incomplete-search",
					items: [item],
				},
			};
			if (problem === "changing-results")
				api.overrides.set("work/project/issue/2", override);
			if (problem === "http-503")
				override = { status: 503, data: { message: "synthetic-error-canary" } };
			if (problem === "rate-limit")
				override = { status: 403, headers: { "x-ratelimit-remaining": "0" } };
			api.overrides.set("work/project/issue/1", override);
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			assert.equal(snapshot.coverage.status, "partial");
			assert.equal(snapshot.repositories[0].searches[0].status, "partial");
			assert.doesNotMatch(JSON.stringify(snapshot), /canary/u);
			if (problem === "rate-limit") assert.equal(api.requests.length, 4);
		});
	}

	test("rejects oversized streamed responses even without a Content-Length header", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		api.overrides.set(
			"work/project/issue/1",
			new Response("x".repeat(4 * 1024 * 1024 + 1)),
		);
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const result = api.collect(new GitHubBriefing());

		// Assert
		await assert.rejects(result, BriefingUnavailableError);
	});

	test("fetches later search pages and deduplicates stable evidence", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		for (const page of [1, 2])
			api.overrides.set(`work/project/issue/${page}`, {
				data: {
					total_count: 2,
					incomplete_results: false,
					items: [api.item(api.repositories[0], "issue", page)],
				},
			});
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(snapshot.repositories[0].items.length, 3);
		assert.equal(snapshot.repositories[0].searches[0].status, "complete");
	});

	test("retains discovery failure instead of claiming inaccessible sources do not exist", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		api.overrides.set("/user/repos/1", { status: 503 });
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.deepEqual(snapshot.coverage.discovery, {
			status: "partial",
			reason: "http-503",
		});
		assert.equal(snapshot.repositories[0].reason, "not-discovered");
	});

	test("caps search pagination at GitHub's 1000-result boundary", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		for (let page = 1; page <= 10; page++)
			api.overrides.set(`work/project/issue/${page}`, {
				data: {
					total_count: 1001,
					incomplete_results: false,
					items: Array.from({ length: 100 }, (_, index) =>
						api.item(
							api.repositories[0],
							"issue",
							(page - 1) * 100 + index + 1,
						),
					),
				},
			});
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(snapshot.repositories[0].searches[0].reason, "page-limit");
		assert.equal(snapshot.repositories[0].items.length, 1001);
		assert.equal(snapshot.coverage.status, "partial");
	});

	for (const problem of [
		"foreign-url",
		"closed",
		"future",
		"wrong-kind",
		"irrelevant",
		"invalid-json",
	]) {
		test(`rejects ${problem} evidence without exposing its payload`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const item = api.item(api.repositories[0], "issue");
			if (problem === "foreign-url")
				item.html_url = "https://untrusted.invalid/private-canary";
			if (problem === "closed") item.state = "closed";
			if (problem === "future") item.updated_at = "2099-01-01T00:00:00Z";
			if (problem === "wrong-kind")
				item.pull_request = { html_url: item.html_url };
			if (problem === "irrelevant") item.user = null;
			api.overrides.set("work/project/issue/1", {
				data: {
					total_count: 1,
					incomplete_results: false,
					items: problem === "invalid-json" ? {} : [item],
				},
			});
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const result = api.collect(new GitHubBriefing());

			// Assert
			await assert.rejects(
				result,
				(error) =>
					error instanceof BriefingUnavailableError &&
					!error.message.includes("canary"),
			);
		});
	}

	test("discards already collected repository evidence when access disappears during pagination", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		api.overrides.set("work/project/pull-request/1", { status: 404 });
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(snapshot.repositories[0].reason, "http-404");
		assert.equal(snapshot.repositories[0].status, "unavailable");
		assert.deepEqual(snapshot.repositories[0].items, []);
		assert.equal(snapshot.repositories[1].status, "complete");
	});

	test("discards the entire snapshot after token revocation", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		api.overrides.set("client/project/issue/1", { status: 401 });
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const result = api.collect(new GitHubBriefing());

		// Assert
		await assert.rejects(result, /authentication failed/u);
	});
});

suite("Collection limits and current provider records", () => {
	test("stops at the global request budget and marks remaining sources unavailable", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		api.repositories = Array.from({ length: 40 }, (_, index) =>
			api.repository(300 + index, "work/repo-" + index),
		);
		api.policy.repositories = api.repositories.map((repo) => ({
			id: repo.id,
			fullName: repo.full_name,
			visibility: "public",
		}));
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(api.requests.length, 100);
		assert.equal(snapshot.coverage.requests, 100);
		assert.equal(snapshot.coverage.status, "partial");
		assert.equal(snapshot.repositories.at(-1).reason, "request-budget");
	});

	test("bounds discovery without claiming unseen repositories are inaccessible", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		for (let page = 1; page <= 10; page++)
			api.overrides.set("/user/repos/" + page, {
				data: [api.repository(500 + page, "other/repo-" + page)],
				headers: {
					link: '<https://api.github.com/user/repos?page=99>; rel="next"',
				},
			});
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(api.requests.length, 11);
		assert.deepEqual(snapshot.coverage.discovery, {
			status: "partial",
			reason: "page-limit",
		});
		assert.equal(snapshot.repositories[0].reason, "not-discovered");
	});

	test("stops issuing requests after the collection deadline", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		const start = Date.now();
		let elapsed = 0;
		t.mock.method(Date, "now", () => start + elapsed);
		t.mock.method(globalThis, "fetch", async (url, options) => {
			const response = await api.fetch(url, options);
			if (new URL(url).pathname === "/user/repos") elapsed = 120_001;
			return response;
		});

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(api.requests.length, 2);
		assert.equal(snapshot.repositories[0].reason, "request-budget");
		assert.equal(snapshot.coverage.status, "partial");
	});

	test("reports a genuinely empty relevant backlog only after successful searches", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		for (const repository of api.repositories) {
			for (const kind of ["issue", "pull-request"])
				api.overrides.set(repository.full_name + "/" + kind + "/1", {
					data: { total_count: 0, incomplete_results: false, items: [] },
				});
		}
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(snapshot.coverage.status, "complete");
		assert.ok(
			snapshot.repositories.every(
				(repository) => repository.items.length === 0,
			),
		);
	});
});

suite("Protected operator command", () => {
	test("prints scoped JSON using only the explicitly supplied token", () => {
		// Arrange
		const api = new GitHubApiFixture();

		// Act
		const result = api.runCli();

		// Assert
		assert.equal(result.status, 0, result.stderr);
		assert.equal(JSON.parse(result.stdout).repositories.length, 2);
		assert.equal(result.stderr, "");
		assert.doesNotMatch(result.stdout, /canary/u);
	});

	for (const options of [
		{ status: 401 },
		{ mode: 0o644 },
		{ symbolic: true },
		{ malformed: true },
		{ args: [] },
		{ args: ["--unknown"] },
	]) {
		test(`rejects unsafe or invalid invocation ${JSON.stringify(options)}`, () => {
			// Arrange
			const api = new GitHubApiFixture();

			// Act
			const result = api.runCli(options);

			// Assert
			assert.equal(result.status, 1);
			assert.equal(result.stdout, "");
			assert.doesNotMatch(result.stderr, /canary|\/tmp\//u);
		});
	}
});
