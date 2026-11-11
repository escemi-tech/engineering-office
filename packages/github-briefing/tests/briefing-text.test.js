import assert from "node:assert/strict";
import { beforeEach, suite, test } from "node:test";
import { GitHubBriefingText } from "../src/briefing-text.js";
import { GitHubBriefing } from "../src/github-briefing.js";
import { GitHubApiFixture } from "./helpers/github-api.js";

suite("Readable GitHub briefing", () => {
	let snapshot;
	let repository;
	beforeEach(async (t) => {
		// Arrange: exercise presentation with actual collector output.
		const api = new GitHubApiFixture();
		const source = api.repositories[0];
		api.tasks.set(source.full_name, [api.task(source)]);
		t.mock.method(globalThis, "fetch", api.fetch);
		snapshot = await api.collect(new GitHubBriefing());
		repository = snapshot.repositories[0];
	});

	test("bounds the briefing and ranks explicit attention ahead of running and old open work", () => {
		// Arrange
		const issue = repository.items[0];
		repository.items.push(
			...Array.from({ length: 8 }, (_, index) => ({
				...issue,
				number: index + 2,
				title: `Backlog ${index}`,
				updatedAt: `2020-01-${String(index + 2).padStart(2, "0")}T00:00:00Z`,
			})),
		);
		repository.pullRequests.items[0].checks.state = "FAILURE";
		const before = structuredClone(snapshot);

		// Act
		const text = new GitHubBriefingText().render(snapshot);

		// Assert
		assert.match(text, /Showing 5 of 13 grouped items/u);
		assert.match(text, /1\. \[Needs attention\] work\/project/u);
		assert.match(text, /2\. \[In progress\] work\/project/u);
		assert.match(text, /3\. \[Open or unresolved work\] work\/project/u);
		assert.doesNotMatch(text, /Backlog 7/u);
		assert.match(text, /CI reports failure/u);
		assert.match(text, /Classification: restricted/u);
		assert.match(text, /Oldest source timestamp: 2020-01-01T00:00:00.000Z/u);
		assert.match(text, /Use --format json/u);
		assert.deepEqual(snapshot, before);
	});

	test("groups verified PR and task links without merging issues or other repositories", () => {
		// Arrange
		const pull = repository.pullRequests.items[0];
		pull.taskIds = ["task-1", "task-2"];
		repository.pullRequests.items.push({
			...pull,
			number: 9,
			url: "https://github.com/work/project/pull/9",
			taskIds: ["task-2"],
		});
		repository.copilot.tasks.push({
			...repository.copilot.tasks[0],
			id: "task-2",
			state: "waiting_for_user",
		});

		// Act
		const text = new GitHubBriefingText().render(snapshot);

		// Assert
		assert.match(text, /Showing 4 of 4 grouped items/u);
		assert.equal(text.match(/Task task-[12]:/gu).length, 2);
		assert.equal(text.match(/PR #1:/gu).length, 2);
		assert.equal(text.match(/Issue #1:/gu).length, 2);
		assert.match(text, /PR #9:/u);
		assert.match(text, /Copilot task waiting for you/u);
	});

	test("keeps attempts distinct and uses the newest attempt even when task state disagrees", () => {
		// Arrange
		const task = repository.copilot.tasks[0];
		task.state = "completed";
		task.sessions[0].state = "failed";
		task.sessions.push({
			...task.sessions[0],
			id: "new-attempt",
			state: "in_progress",
			createdAt: "2020-01-02T00:00:00Z",
		});

		// Act
		const text = new GitHubBriefingText().render(snapshot);

		// Assert
		assert.match(text, /1\. \[In progress\]/u);
		assert.doesNotMatch(text, /Needs attention/u);
		assert.match(text, /Task task-1: completed/u);
		assert.match(
			text,
			/latest first: new-attempt=in_progress, session-1=failed/u,
		);
	});

	test("preserves conflicting newest attempts at an equal instant", () => {
		// Arrange
		const task = repository.copilot.tasks[0];
		task.state = "idle";
		task.sessions[0].state = "completed";
		task.sessions.push({
			...task.sessions[0],
			id: "same-time",
			createdAt: "2020-01-01T00:00:00.000Z",
			state: "timed_out",
		});

		// Act
		const text = new GitHubBriefingText().render(snapshot);

		// Assert
		assert.match(text, /Latest Copilot attempt timed out/u);
		assert.match(text, /same-time=timed_out/u);
	});

	test("does not treat historical failures on merged PRs as current attention", () => {
		// Arrange
		const pull = repository.pullRequests.items[0];
		pull.state = "MERGED";
		pull.checks.state = "FAILURE";
		pull.reviewDecision = "CHANGES_REQUESTED";
		repository.items[1].reasons = ["review-requested"];
		pull.taskIds = ["task-1"];
		const task = repository.copilot.tasks[0];
		task.state = "completed";
		task.sessions[0].state = "completed";

		// Act
		const text = new GitHubBriefingText().render(snapshot);

		// Assert
		assert.doesNotMatch(text, /Needs attention/u);
		assert.match(text, /\[Completed or inactive\] work\/project/u);
		assert.match(text, /PR #1: MERGED; review CHANGES_REQUESTED; CI FAILURE/u);
	});

	test("keeps missing review and CI unknown and labels search-based review requests", () => {
		// Arrange
		const pull = repository.pullRequests.items[0];
		pull.reviewDecision = null;
		pull.checks.state = null;
		repository.items[1].reasons = ["review-requested"];

		// Act
		const text = new GitHubBriefingText().render(snapshot);

		// Assert
		assert.match(
			text,
			/Review requested from you or a team \(search result\)/u,
		);
		assert.match(text, /review not reported; CI not reported/u);
		assert.doesNotMatch(text, /CI SUCCESS|ready to merge/u);
	});

	test("shows unlinked tasks, inaccessible PR context and incomplete coverage", () => {
		// Arrange
		snapshot.repositories = [repository];
		snapshot.coverage.status = "partial";
		snapshot.coverage.discovery = { status: "partial", reason: "page-limit" };
		snapshot.coverage.unadmittedRepositories = 7;
		repository.status = "partial";
		repository.pullRequests = {
			status: "partial",
			unresolvedArtifacts: [{ resourceId: "9999", taskIds: ["task-1"] }],
			items: [
				{
					number: 9,
					status: "unavailable",
					reason: "not-accessible",
					taskIds: [],
					url: "https://github.com/work/project/pull/9",
				},
			],
		};
		repository.copilot.tasks[0].title = undefined;
		repository.copilot.tasks[0].url = undefined;
		repository.copilot.tasks[0].sessions = [];
		repository.copilot.tasks[0].sessionCoverage = { status: "unavailable" };

		// Act
		const text = new GitHubBriefingText().render(snapshot);

		// Assert
		assert.match(text, /Discovery: partial \(page-limit\)/u);
		assert.match(text, /7 discovered but not admitted/u);
		assert.match(text, /1 unresolved PR references/u);
		assert.match(text, /Copilot task task-1/u);
		assert.match(text, /No task link supplied/u);
		assert.match(
			text,
			/0 collected \(unavailable\); latest first: none returned/u,
		);
		assert.match(text, /Oldest source timestamp: not available/u);
		assert.match(text, /Pull request #9/u);
		assert.match(text, /CI unavailable \(not-accessible\)/u);
		assert.doesNotMatch(text, /pull\/9999/u);
	});

	test("labels a mention as relevance without claiming that a reply is owed", () => {
		// Arrange
		repository.items[0].reasons = ["mentioned"];

		// Act
		const text = new GitHubBriefingText().render(snapshot);

		// Assert
		assert.match(text, /Mentioned \(search result\)/u);
		assert.doesNotMatch(text, /Needs attention|reply required/u);
	});

	test("bounds linked details and session histories with visible omissions", () => {
		// Arrange
		const task = repository.copilot.tasks[0];
		repository.copilot.tasks = Array.from({ length: 6 }, (_, index) => ({
			...task,
			id: `task-${index}`,
			sessions: Array.from({ length: 5 }, (_, attempt) => ({
				...task.sessions[0],
				id: `attempt-${attempt}`,
			})),
		}));
		repository.pullRequests.items[0].taskIds = repository.copilot.tasks.map(
			({ id }) => id,
		);

		// Act
		const text = new GitHubBriefingText().render(snapshot);

		// Assert
		assert.equal(text.match(/ {3}Task task-/gu).length, 3);
		assert.match(text, /3 more task records/u);
		assert.match(text, /5 collected \(complete\)/u);
		assert.match(text, /more in JSON/u);
		assert.doesNotMatch(text, /attempt-4=/u);
	});

	test("neutralizes terminal controls and bounds source titles without changing evidence", () => {
		// Arrange
		repository.items[0].title = `\u001b[31mUntrusted\u001b[0m\nforged line 👩‍💻\r\u202e${"é".repeat(300)}`;
		const original = repository.items[0].title;

		// Act
		const text = new GitHubBriefingText().render(snapshot);

		// Assert
		for (const control of ["\u001b", "\r", "\u202e", "\nforged line"])
			assert.equal(text.includes(control), false);
		assert.match(text, /Untrusted forged line/u);
		assert.ok(text.includes("👩‍💻"));
		assert.match(text, /é\.\.\./u);
		assert.equal(repository.items[0].title, original);
	});

	for (const complete of [true, false]) {
		test(`distinguishes empty evidence with ${complete ? "complete" : "partial"} coverage`, () => {
			// Arrange
			snapshot.repositories = [];
			snapshot.coverage.status = complete ? "complete" : "partial";

			// Act
			const text = new GitHubBriefingText().render(snapshot);

			// Assert
			assert.match(
				text,
				complete
					? /No matching work in the admitted source reads/u
					: /No work could be summarized from the incomplete source reads/u,
			);
			assert.match(
				text,
				/Outside coverage: team mentions; copilot tasks created by others/u,
			);
		});
	}
});
