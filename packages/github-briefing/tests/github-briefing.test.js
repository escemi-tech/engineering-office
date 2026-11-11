import assert from "node:assert/strict";
import { beforeEach, suite, test } from "node:test";
import { GitHubBriefingText } from "../src/briefing-text.js";
import {
	BriefingUnavailableError,
	GitHubBriefing,
} from "../src/github-briefing.js";
import { RepositoryAccess } from "../src/repository-access.js";
import { GitHubApiFixture } from "./helpers/github-api.js";

suite("Account-wide scoped evidence", () => {
	test("discovers across owners and retains old unresolved work with minimal provenance", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(snapshot.schemaVersion, 8);
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
		assert.equal(api.requests.length, 15);
		const discovery = api.requests[1].url.searchParams;
		assert.equal(
			discovery.get("affiliation"),
			"owner,collaborator,organization_member",
		);
		assert.equal(discovery.get("visibility"), "all");
		for (const request of api.requests) {
			assert.equal(request.url.origin, "https://api.github.com");
			assert.equal(
				request.method,
				request.url.pathname === "/graphql" ? "POST" : "GET",
			);
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
			if (query.includes("mentions:")) {
				assert.match(
					query,
					/^\(repo:work\/project OR repo:client\/project\) is:open is:(issue|pull-request) mentions:example-user$/u,
				);
			} else if (query.includes("review-requested:")) {
				assert.match(
					query,
					/^\(repo:work\/project OR repo:client\/project\) is:open is:pull-request review-requested:example-user$/u,
				);
			} else {
				assert.match(
					query,
					/^\(repo:work\/project OR repo:client\/project\) is:open is:(issue|pull-request) \(author:example-user OR assignee:example-user\)$/u,
				);
			}
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
				data: { total_count: 0, incomplete_results: false, items: [] },
			});
			api.overrides.set(
				`work/project/pull-request/${relation === "assigned" ? "" : "reviews/"}1`,
				{
					data: { total_count: 1, incomplete_results: false, items: [item] },
				},
			);
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

suite("Review request relevance", () => {
	let api;
	let item;
	beforeEach((t) => {
		// Arrange
		api = new GitHubApiFixture();
		item = api.item(api.repositories[0], "pull-request");
		t.mock.method(globalThis, "fetch", api.fetch);
	});

	for (const relation of ["authored", "assigned"]) {
		test(`retains a review request on an ${relation} PR and shows the qualified attention signal`, async () => {
			// Arrange
			if (relation === "assigned") {
				item.user = null;
				item.assignees = [api.viewer];
			}
			for (const selection of ["", "reviews/"])
				api.setSearchResult(`work/project/pull-request/${selection}1`, [item]);

			// Act
			const snapshot = await api.collect(new GitHubBriefing());
			const text = new GitHubBriefingText().render(snapshot);

			// Assert
			const repository = snapshot.repositories[0];
			assert.deepEqual(repository.items[1].reasons, [
				relation,
				"review-requested",
			]);
			assert.deepEqual(repository.searches.at(-1), {
				kind: "pull-request",
				selection: "reviews",
				status: "complete",
				matched: 1,
				batchTotal: 1,
			});
			assert.equal(
				snapshot.coverage.excluded.includes("team-review-requests"),
				false,
			);
			assert.match(text, /\[Needs attention\] work\/project/u);
			assert.match(
				text,
				/Review requested from you or a team \(search result\)/u,
			);
		});
	}

	test("retains an unassigned delegated PR with explicit search attribution", async () => {
		// Arrange
		item.user = { id: 505, login: "Copilot" };
		api.setSearchResult("work/project/pull-request/1", [item]);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());
		const text = new GitHubBriefingText().render(snapshot);

		// Assert
		assert.equal(snapshot.coverage.status, "complete");
		assert.deepEqual(snapshot.repositories[0].items[1].reasons, [
			"author-search",
		]);
		assert.match(text, /Authored or delegated \(search result\)/u);
	});

	for (const mismatch of ["repository", "url", "number", "issue"]) {
		test(`rejects a search match with inconsistent ${mismatch} evidence`, async () => {
			// Arrange
			item.user = { id: 505, login: "Copilot" };
			let kind = "pull-request";
			if (mismatch === "repository")
				item.repository_url = "https://api.github.com/repos/unadmitted/project";
			if (mismatch === "url")
				item.html_url = "https://github.com/work/project/pull/999";
			if (mismatch === "number") item.number = 999;
			if (mismatch === "issue") {
				kind = "issue";
				item = { ...api.item(api.repositories[0], kind), user: null };
			}
			api.setSearchResult(`work/project/${kind}/1`, [item]);

			// Act
			const result = api.collect(new GitHubBriefing());

			// Assert
			await assert.rejects(result, BriefingUnavailableError);
		});
	}

	for (const status of [401, 403, 404, 422, 429, 503]) {
		test(`handles review search failure ${status} without inferring a review request`, async () => {
			// Arrange
			api.overrides.set("work/project/pull-request/reviews/1", {
				status,
				data: { message: "private-review-error-canary" },
			});

			// Act
			const result = api.collect(new GitHubBriefing());

			// Assert
			if (status === 401)
				await assert.rejects(result, BriefingUnavailableError);
			else {
				const snapshot = await result;
				const repository = snapshot.repositories[0];
				assert.equal(snapshot.coverage.status, "partial");
				if ([403, 404, 422].includes(status)) {
					assert.equal(repository.status, "unavailable");
					assert.deepEqual(repository.items, []);
				} else {
					assert.equal(repository.items.length, 2);
					assert.equal(repository.searches.at(-1).status, "partial");
					assert.ok(
						repository.items.every(
							({ reasons }) => !reasons.includes("review-requested"),
						),
					);
					assert.match(
						new GitHubBriefingText().render(snapshot),
						/pull-request reviews partial/u,
					);
				}
				assert.doesNotMatch(
					JSON.stringify(snapshot),
					/private-review-error-canary/u,
				);
			}
		});
	}

	test("paginates review requests independently and reports incomplete review coverage", async () => {
		// Arrange
		api.overrides.set("work/project/pull-request/reviews/1", {
			data: { total_count: 2, incomplete_results: false, items: [item] },
			headers: { link: '<https://untrusted.invalid>; rel="next"' },
		});
		api.overrides.set("work/project/pull-request/reviews/2", {
			data: { total_count: 2, incomplete_results: true, items: [] },
		});

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.deepEqual(snapshot.repositories[0].searches.at(-1), {
			kind: "pull-request",
			selection: "reviews",
			status: "partial",
			reason: "incomplete-search",
			matched: 1,
			batchTotal: 2,
		});
		assert.deepEqual(snapshot.repositories[0].items[1].reasons, [
			"authored",
			"review-requested",
		]);
		assert.ok(
			api.requests.every(({ url }) => url.origin === "https://api.github.com"),
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
			api.overrides.set("work/project/access", {
				data: api.graphql(repository, {
					issues: { totalCount: 1 },
					pullRequests: { totalCount: 1 },
				}),
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
						!url.searchParams.get("q")?.includes("repo:work/project"),
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
			if (problem === "rate-limit") assert.equal(api.requests.length, 5);
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
		api.policy.repositories = [api.policy.repositories[0]];
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
	test("visits every repository in a large admitted scope with bounded batched searches", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		api.setRepositoryCount(300);
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(snapshot.coverage.status, "complete");
		assert.equal(snapshot.repositories.length, 300);
		assert.ok(
			snapshot.repositories.every(
				(repo) => repo.items.length === 2 && repo.access.status === "complete",
			),
		);
		const searches = api.requests.filter(
			({ url }) => url.pathname === "/search/issues",
		);
		assert.equal(searches.length, 75);
		assert.ok(
			searches.every(
				({ url }) =>
					[...url.searchParams.get("q").matchAll(/repo:/gu)].length === 20,
			),
		);
		assert.ok(snapshot.coverage.requests < 1500);
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
			if (new URL(url).pathname === "/user/repos") elapsed = 900_001;
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

	test("prints a readable briefing with an explicit format", () => {
		// Arrange
		const api = new GitHubApiFixture();

		// Act
		const result = api.runCli({ format: "text" });

		// Assert
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /^GitHub work briefing\n/u);
		assert.match(result.stdout, /Coverage: complete/u);
		assert.match(
			result.stdout,
			/Issue #1: https:\/\/github.com\/work\/project/u,
		);
		assert.doesNotMatch(result.stdout, /canary/u);
		assert.equal(result.stderr, "");
	});

	for (const options of [
		{ status: 401 },
		{ mode: 0o644 },
		{ symbolic: true },
		{ namedPipe: "token" },
		{ namedPipe: "source" },
		{ malformed: true },
		{ args: [] },
		{ format: "html" },
		{ args: ["--unknown"] },
	]) {
		test(`rejects unsafe or invalid invocation ${JSON.stringify(options)}`, () => {
			// Arrange
			const api = new GitHubApiFixture();

			// Act
			const result = api.runCli(options);

			// Assert
			assert.equal(result.status, 1);
			assert.equal(result.error, undefined);
			assert.equal(result.stdout, "");
			assert.doesNotMatch(result.stderr, /canary|\/tmp\//u);
		});
	}
});

suite("Direct user mentions", () => {
	let api;
	beforeEach((t) => {
		// Arrange
		api = new GitHubApiFixture();
		t.mock.method(globalThis, "fetch", api.fetch);
	});

	for (const kind of ["issue", "pull-request"]) {
		test(`includes a mentioned ${kind} without authorship or assignment`, async () => {
			// Arrange
			const repo = api.repositories[0];
			const item = { ...api.item(repo, kind, 2), user: null };
			api.overrides.set(`work/project/${kind}/mentions/1`, {
				data: { total_count: 1, incomplete_results: false, items: [item] },
			});
			api.pulls.set(repo.full_name, [api.pull(repo), api.pull(repo, 2)]);

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			const result = snapshot.repositories[0];
			assert.equal(result.status, "complete");
			assert.equal(result.items.length, 3);
			assert.deepEqual(
				result.items.find(({ issueId }) => issueId === item.id).reasons,
				["mentioned"],
			);
			assert.deepEqual(
				result.searches.find(
					(search) => search.kind === kind && search.selection === "mentions",
				),
				{
					kind,
					selection: "mentions",
					status: "complete",
					matched: 1,
					batchTotal: 1,
				},
			);
			assert.equal(snapshot.coverage.excluded.includes("mentions"), false);
			assert.doesNotMatch(JSON.stringify(snapshot), /body-canary|assignees/u);
			if (kind === "pull-request")
				assert.equal(
					result.pullRequests.items.find(({ number }) => number === 2).status,
					"complete",
				);
		});
	}

	test("unions overlapping relevance once and reads each PR context once", async () => {
		// Arrange
		const repo = api.repositories[0];
		const issue = api.item(repo, "issue");
		const pull = api.item(repo, "pull-request");
		for (const [key, item] of [
			["issue/mentions/1", issue],
			["pull-request/1", pull],
			["pull-request/mentions/1", pull],
			["pull-request/reviews/1", pull],
		])
			api.overrides.set(`work/project/${key}`, {
				data: { total_count: 1, incomplete_results: false, items: [item] },
			});

		// Act
		const snapshot = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(snapshot.repositories[0].items.length, 2);
		assert.deepEqual(
			snapshot.repositories[0].items.map(({ reasons }) => reasons),
			[
				["authored", "mentioned"],
				["authored", "mentioned", "review-requested"],
			],
		);
		assert.equal(
			api.requests.filter(
				({ url, body }) =>
					url.pathname === "/graphql" &&
					JSON.parse(body).query.includes("query BriefingPullRequest(") &&
					JSON.parse(body).variables.owner === "work",
			).length,
			1,
		);
	});

	for (const revision of ["older", "newer", "same-time"]) {
		test(`reports changing evidence when the mention query returns a ${revision} revision`, async () => {
			// Arrange
			const item = api.item(api.repositories[0], "issue");
			item.title = "Changed source title";
			if (revision !== "same-time")
				item.updated_at =
					revision === "older"
						? "2019-01-01T00:00:00Z"
						: "2021-01-01T00:00:00Z";
			api.overrides.set("work/project/issue/mentions/1", {
				data: { total_count: 1, incomplete_results: false, items: [item] },
			});

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			const result = snapshot.repositories[0];
			assert.equal(result.status, "partial");
			assert.equal(result.searches[1].reason, "changing-results");
			assert.equal(result.items.length, 2);
			assert.equal(result.items[0].title === item.title, revision !== "older");
			assert.equal(
				result.items[0].reasons.includes("mentioned"),
				revision !== "older",
			);
		});
	}

	for (const problem of ["incomplete", "http-503", "rate-limit"]) {
		test(`keeps existing work with explicit ${problem} mention coverage`, async () => {
			// Arrange
			const override =
				problem === "incomplete"
					? { data: { total_count: 0, incomplete_results: true, items: [] } }
					: { status: problem === "http-503" ? 503 : 429 };
			api.overrides.set("work/project/issue/mentions/1", override);

			// Act
			const snapshot = await api.collect(new GitHubBriefing());

			// Assert
			assert.equal(snapshot.coverage.status, "partial");
			assert.equal(snapshot.repositories[0].items[0].kind, "issue");
			assert.equal(snapshot.repositories[0].searches[1].status, "partial");
			if (problem === "rate-limit") assert.equal(api.requests.length, 6);
		});
	}

	for (const status of [401, 403, 404, 422]) {
		test(`rejects mention access failure ${status} without retaining unavailable evidence`, async () => {
			// Arrange
			api.overrides.set("work/project/pull-request/mentions/1", {
				status,
				data: { message: "private-error-canary" },
			});

			// Act
			const result = api.collect(new GitHubBriefing());

			// Assert
			if (status === 401)
				await assert.rejects(result, BriefingUnavailableError);
			else {
				const snapshot = await result;
				assert.equal(snapshot.repositories[0].status, "unavailable");
				assert.deepEqual(snapshot.repositories[0].items, []);
				assert.doesNotMatch(JSON.stringify(snapshot), /private-error-canary/u);
			}
		});
	}

	for (const mismatch of ["number", "id", "kind", "foreign-url"]) {
		test(`rejects ${mismatch} mismatches between mention and work identities`, async () => {
			// Arrange
			const kind = mismatch === "kind" ? "pull-request" : "issue";
			const item = api.item(api.repositories[0], kind);
			if (mismatch === "kind")
				item.id = api.item(api.repositories[0], "issue").id;
			if (mismatch === "number") {
				item.number = 2;
				item.html_url = "https://github.com/work/project/issues/2";
			}
			if (mismatch === "id") item.id += 1;
			if (mismatch === "foreign-url")
				item.html_url = "https://github.com/foreign/repo/issues/1";
			api.overrides.set(`work/project/${kind}/mentions/1`, {
				data: { total_count: 1, incomplete_results: false, items: [item] },
			});

			// Act
			const result = api.collect(new GitHubBriefing());

			// Assert
			await assert.rejects(result, BriefingUnavailableError);
		});
	}
});

suite("Operational setup and bounded refresh", () => {
	test("creates an owner-only policy from explicit account-wide admission and exclusions", () => {
		// Arrange
		const api = new GitHubApiFixture();

		// Act
		const result = api.runCli({ initialize: true });

		// Assert
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout, "");
		assert.equal(result.mode, 0o600);
		assert.deepEqual(result.source, {
			...api.policy,
			repositories: [api.policy.repositories[0]],
		});
		assert.doesNotMatch(result.stderr, /canary|client\/project/u);
	});

	test("refuses to overwrite an existing admission policy", () => {
		// Arrange
		const api = new GitHubApiFixture();

		// Act
		const result = api.runCli({ initialize: true, existing: true });

		// Assert
		assert.equal(result.status, 1);
		assert.deepEqual(result.source, api.policy);
	});

	test("setup performs metadata reads only and refuses incomplete discovery", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		api.overrides.set("/user/repos/1", { status: 503 });
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const result = new GitHubBriefing().createPolicy({
			token: "synthetic",
			scope: "professional-internal",
		});

		// Assert
		await assert.rejects(result, /discovery incomplete/u);
		assert.deepEqual(
			api.requests.map(({ url }) => url.pathname),
			["/user", "/user/repos"],
		);
	});

	for (const [bucket, beyondDeadline] of [
		["search", false],
		["search", true],
		["tasks", false],
		["tasks", true],
	]) {
		test(`honors a ${bucket} quota reset ${beyondDeadline ? "beyond" : "within"} the refresh deadline`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const start = Date.now();
			let elapsed = 0;
			const waits = [];
			t.mock.method(Date, "now", () => start + elapsed);
			t.mock.method(globalThis, "setTimeout", (resolve, delay) => {
				waits.push(delay);
				elapsed += delay;
				resolve();
			});
			api.overrides.set(
				bucket === "search"
					? "work/project/issue/1"
					: "/agents/repos/work/project/tasks/1",
				{
					headers: {
						"x-ratelimit-remaining": "0",
						"x-ratelimit-reset": String(
							Math.ceil(start / 1000) + (beyondDeadline ? 901 : 30),
						),
					},
				},
			);
			t.mock.method(globalThis, "fetch", api.fetch);

			// Act
			const result = await api.collect(new GitHubBriefing());

			// Assert
			assert.equal(
				result.coverage.status,
				beyondDeadline ? "partial" : "complete",
			);
			assert.equal(waits.length, beyondDeadline ? 0 : 1);
			if (beyondDeadline)
				assert.equal(
					(bucket === "search"
						? result.repositories[0].searches[1]
						: result.repositories[1].copilot
					).reason,
					"rate-limit",
				);
			else assert.ok(elapsed >= 30_000 && elapsed < 33_000);
		});
	}

	test("never exceeds the global budget for a scope larger than a single refresh", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		api.setRepositoryCount(1000);
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const result = await api.collect(new GitHubBriefing());

		// Assert
		assert.equal(api.requests.length, 2000);
		assert.equal(result.coverage.status, "partial");
		assert.equal(result.repositories.at(-1).access.reason, "request-budget");
		assert.equal(result.repositories.length, 1000);
	});
});

suite("Individual permissions around batched search", () => {
	for (const afterSearch of [false, true]) {
		test(`discards a source with denied issue access ${afterSearch ? "after" : "before"} search`, async (t) => {
			// Arrange
			const api = new GitHubApiFixture();
			const denied = {
				data: {
					errors: [{ type: "FORBIDDEN", message: "synthetic-error-canary" }],
				},
			};
			if (!afterSearch) api.overrides.set("work/project/access", denied);
			t.mock.method(globalThis, "fetch", async (url, options) => {
				const result = await api.fetch(url, options);
				if (afterSearch && new URL(url).pathname === "/search/issues")
					api.overrides.set("work/project/access", denied);
				return result;
			});

			// Act
			const result = await api.collect(new GitHubBriefing());

			// Assert
			assert.deepEqual(result.repositories[0], {
				...api.policy.repositories[0],
				status: "unavailable",
				reason: "http-403",
				items: [],
			});
			assert.equal(result.repositories[1].status, "complete");
			assert.doesNotMatch(JSON.stringify(result), /canary/u);
			if (!afterSearch)
				assert.ok(
					api.requests.every(
						({ url }) =>
							!url.searchParams.get("q")?.includes("repo:work/project"),
					),
				);
		});
	}

	test("rejects a misspelled exclusion instead of admitting the unintended repository", async (t) => {
		// Arrange
		const api = new GitHubApiFixture();
		t.mock.method(globalThis, "fetch", api.fetch);

		// Act
		const result = new GitHubBriefing().createPolicy({
			token: "synthetic",
			scope: "professional-internal",
			exclude: ["client/wrong-name"],
		});

		// Assert
		await assert.rejects(result, /excluded repository was not discovered/u);
		assert.equal(api.requests.length, 2);
	});

	test("limits repository access queries to fixed fields and admitted identities", () => {
		// Arrange
		const api = new GitHubApiFixture();
		const query = {
			query: RepositoryAccess.query,
			variables: { owner: "work", name: "project" },
		};

		// Act
		const allowed = RepositoryAccess.allows(
			JSON.stringify(query),
			api.policy.repositories,
		);
		const foreign = RepositoryAccess.allows(
			JSON.stringify({
				...query,
				variables: { owner: "other", name: "private" },
			}),
			api.policy.repositories,
		);

		// Assert
		assert.equal(allowed, true);
		assert.equal(foreign, false);
		assert.throws(() =>
			RepositoryAccess.allows(
				JSON.stringify({ ...query, query: "mutation { forbidden }" }),
				api.policy.repositories,
			),
		);
	});
});
