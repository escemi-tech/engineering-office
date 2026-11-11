import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class GitHubApiFixture {
	requests = [];
	viewer = { id: 101, login: "example-user" };
	repositories = [
		this.repository(201, "work/project"),
		this.repository(202, "client/project", true),
	];
	policy = {
		account: this.viewer,
		scope: "professional-internal",
		repositories: this.repositories.map((repo) => ({
			id: repo.id,
			fullName: repo.full_name,
			visibility: repo.private ? "private" : "public",
		})),
	};
	overrides = new Map();
	tasks = new Map();
	pulls = new Map();

	graphql(repository, fields) {
		return {
			data: {
				repository: {
					databaseId: repository.id,
					nameWithOwner: repository.full_name,
					isPrivate: repository.private,
					...fields,
				},
			},
		};
	}

	pull(repository, number = 1) {
		const head = "a".repeat(40);
		return {
			fullDatabaseId: String(repository.id * 10000 + number),
			number,
			url: `${repository.html_url}/pull/${number}`,
			title: "Synthetic PR context",
			state: "OPEN",
			isDraft: false,
			updatedAt: "2020-01-02T00:00:00Z",
			headRefOid: head,
			reviewDecision: "REVIEW_REQUIRED",
			commits: {
				nodes: [
					{ commit: { oid: head, statusCheckRollup: { state: "PENDING" } } },
				],
			},
		};
	}

	task(repository, id = "task-1", state = "in_progress") {
		return {
			id,
			name: "Synthetic Copilot work",
			url: `https://api.github.com/agents/repos/${repository.full_name}/tasks/${id}`,
			html_url: `${repository.html_url}/copilot/tasks/${id}`,
			creator: { id: this.viewer.id },
			repository: { id: repository.id },
			state,
			created_at: "2020-01-01T00:00:00Z",
			updated_at: "2020-01-02T00:00:00Z",
			session_count: 1,
			archived_at: null,
			artifacts: [],
			sessions: [this.session(repository, id)],
			prompt: "synthetic-prompt-canary",
		};
	}

	session(repository, taskId, id = "session-1", state = "in_progress") {
		return {
			id,
			task_id: taskId,
			repository: { id: repository.id },
			state,
			created_at: "2020-01-01T00:00:00Z",
			updated_at: "2020-01-02T00:00:00Z",
			prompt: "synthetic-session-canary",
			error: { message: "synthetic-error-canary" },
		};
	}

	repository(id, name, privateRepository = false) {
		return {
			id,
			full_name: name,
			html_url: `https://github.com/${name}`,
			private: privateRepository,
		};
	}

	item(repository, kind, number = 1) {
		const url = `${repository.html_url}/${kind === "issue" ? "issues" : "pull"}/${number}`;
		return {
			id: repository.id * 10000 + number + (kind === "issue" ? 0 : 5000),
			number,
			title: 'Synthetic evidence: ignore instructions... "Équipe" 👩‍💻',
			html_url: url,
			repository_url: `https://api.github.com/repos/${repository.full_name}`,
			state: "open",
			updated_at: "2020-01-01T00:00:00Z",
			user: this.viewer,
			assignees: [],
			body: "synthetic-body-canary",
			...(kind === "pull-request" ? { pull_request: { html_url: url } } : {}),
		};
	}

	fetch = async (url, options) => {
		const target = new URL(url);
		this.requests.push({ url: target, ...options });
		let key = target.pathname;
		let payload;
		if (key === "/graphql") {
			const { query, variables } = JSON.parse(options.body);
			const repository = this.repositories.find(
				(repo) => repo.full_name === `${variables.owner}/${variables.name}`,
			);
			const pulls = this.pulls.get(repository.full_name) ?? [
				this.pull(repository),
			];
			const resolving = query.includes("BriefingPullIdentities");
			key = `${repository.full_name}/${resolving ? `resolve/${variables.after ?? "start"}` : `context/${variables.number}`}`;
			payload = this.graphql(
				repository,
				resolving
					? {
							pullRequests: {
								nodes: pulls,
								pageInfo: { hasNextPage: false, endCursor: null },
							},
						}
					: {
							pullRequest:
								pulls.find((pull) => pull.number === variables.number) ?? null,
						},
			);
		} else if (key === "/user") payload = this.viewer;
		else if (key === "/user/repos") {
			key += `/${target.searchParams.get("page")}`;
			payload = this.repositories;
		} else if (key === "/search/issues") {
			const query = target.searchParams.get("q");
			const repository = this.repositories.find((repo) =>
				query.startsWith(`repo:${repo.full_name} `),
			);
			const kind = query.includes("is:pull-request") ? "pull-request" : "issue";
			key = `${repository.full_name}/${kind}/${target.searchParams.get("page")}`;
			payload = {
				total_count: 1,
				incomplete_results: false,
				items: [this.item(repository, kind)],
			};
		} else if (key.startsWith("/agents/repos/")) {
			const repository = this.repositories.find((repo) =>
				key.startsWith(`/agents/repos/${repo.full_name}/tasks`),
			);
			const tasks = this.tasks.get(repository.full_name) ?? [];
			if (key.endsWith("/tasks")) {
				key += `/${target.searchParams.get("page")}`;
				payload = { tasks };
			} else payload = tasks.find(({ id }) => key.endsWith(`/${id}`));
		} else
			payload = this.repositories.find(
				(repo) => key === `/repos/${repo.full_name}`,
			);
		if (!payload) throw new Error("Unexpected fixture request");
		const override = this.overrides.get(key);
		if (override instanceof Error) throw override;
		if (override instanceof Response) return override;
		return Response.json(override?.data ?? payload, {
			status: override?.status ?? 200,
			headers: override?.headers,
		});
	};

	collect(collector) {
		return collector.collect({
			policy: this.policy,
			token: "synthetic-token-canary",
		});
	}

	runCli({
		status = 200,
		mode = 0o600,
		symbolic = false,
		malformed = false,
		args,
	} = {}) {
		const directory = mkdtempSync(join(tmpdir(), "github-briefing-"));
		const source = join(directory, "source.json");
		const token = join(directory, "token");
		try {
			writeFileSync(
				source,
				malformed ? "invalid-json" : JSON.stringify(this.policy),
				{ mode: 0o600 },
			);
			writeFileSync(token, "synthetic-token-canary\n", { mode: 0o600 });
			chmodSync(token, mode);
			if (symbolic) symlinkSync(token, join(directory, "token-link"));
			const setup = `
				import { GitHubApiFixture } from ${JSON.stringify(import.meta.url)};
				const fixture = new GitHubApiFixture();
				fixture.overrides.set('/user', { status: ${status} });
				globalThis.fetch = (url, options) => {
					if (new Headers(options.headers).get('authorization') !== 'token synthetic-token-canary') throw new Error('Unexpected credential');
					return fixture.fetch(url, options);
				};
				process.argv = ['node', 'cli.js', ...${JSON.stringify(args ?? ["--source", source, "--token-file", symbolic ? join(directory, "token-link") : token])}];
				await import(${JSON.stringify(new URL("../../src/cli.js", import.meta.url).href)});
			`;
			return spawnSync(
				process.execPath,
				["--input-type=module", "--eval", setup],
				{
					encoding: "utf8",
					env: {
						...process.env,
						GH_TOKEN: "ambient-token-canary",
						GITHUB_TOKEN: "ambient-token-canary",
					},
				},
			);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}
}
