import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
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

	setSearchResult(key, items) {
		this.overrides.set(key, {
			data: { total_count: items.length, incomplete_results: false, items },
		});
	}

	setRepositoryCount(count) {
		this.repositories = Array.from({ length: count }, (_, index) =>
			this.repository(300 + index, `work/repo-${index}`),
		);
		this.policy.repositories = this.repositories.map((repo) => ({
			id: repo.id,
			fullName: repo.full_name,
			visibility: "public",
		}));
	}

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
			if (query.includes("BriefingRepositoryAccess")) {
				return this.response(
					`${repository.full_name}/access`,
					this.graphql(repository, {
						issues: { totalCount: 1 },
						pullRequests: { totalCount: 1 },
					}),
				);
			}
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
			const page = Number(target.searchParams.get("page"));
			return this.response(
				key,
				this.repositories.slice((page - 1) * 100, page * 100),
				page * 100 < this.repositories.length
					? { link: '<https://api.github.com/user/repos>; rel="next"' }
					: {},
			);
		} else if (key === "/search/issues") {
			const query = target.searchParams.get("q");
			if (query.startsWith("(") && !query.split(")")[0].includes(" OR "))
				throw new Error("Batched repository qualifiers require explicit OR");
			const names = [...query.matchAll(/repo:([^ )]+)/gu)].map(
				(match) => match[1],
			);
			const kind = query.includes("is:pull-request") ? "pull-request" : "issue";
			const relationship = query.includes("mentions:")
				? "mentions/"
				: query.includes("review-requested:")
					? "reviews/"
					: "";
			const responses = names.map((name) => {
				const repository = this.repositories.find(
					(repo) => repo.full_name === name,
				);
				const page = target.searchParams.get("page");
				return this.response(`${name}/${kind}/${relationship}${page}`, {
					total_count: relationship ? 0 : 1,
					incomplete_results: false,
					items:
						relationship || page !== "1" ? [] : [this.item(repository, kind)],
				});
			});
			if (responses.length === 1) return responses[0];
			const failed = responses.find((response) => !response.ok);
			if (failed) return failed;
			const pages = [];
			for (const response of responses) {
				try {
					pages.push(await response.clone().json());
				} catch {
					return response;
				}
			}
			return Response.json(
				{
					total_count: pages.reduce((sum, page) => sum + page.total_count, 0),
					incomplete_results: pages.some((page) => page.incomplete_results),
					items: pages.flatMap((page) => page.items),
				},
				{
					headers: Object.fromEntries(
						responses
							.flatMap((response) => [...response.headers])
							.filter(([name]) => name !== "content-type"),
					),
				},
			);
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
		return this.response(key, payload);
	};

	response(key, payload, headers = {}) {
		const override = this.overrides.get(key);
		if (override instanceof Error) throw override;
		if (override instanceof Response) return override.clone();
		return Response.json(override?.data ?? payload, {
			status: override?.status ?? 200,
			headers: override?.headers ?? headers,
		});
	}

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
		namedPipe,
		malformed = false,
		format,
		args,
		initialize = false,
		existing = false,
	} = {}) {
		const directory = mkdtempSync(join(tmpdir(), "github-briefing-"));
		const source = join(directory, "source.json");
		const token = join(directory, "token");
		try {
			if (!initialize || existing)
				writeFileSync(
					source,
					malformed ? "invalid-json" : JSON.stringify(this.policy),
					{ mode: 0o600 },
				);
			writeFileSync(token, "synthetic-token-canary\n", { mode: 0o600 });
			chmodSync(token, mode);
			if (symbolic) symlinkSync(token, join(directory, "token-link"));
			if (namedPipe) {
				const path = namedPipe === "token" ? token : source;
				rmSync(path);
				const result = spawnSync("mkfifo", ["-m", "600", path]);
				if (result.status !== 0)
					throw new Error("Could not create named-pipe fixture");
			}
			const setup = `
				import { GitHubApiFixture } from ${JSON.stringify(import.meta.url)};
				const fixture = new GitHubApiFixture();
				fixture.overrides.set('/user', { status: ${status} });
				globalThis.fetch = (url, options) => {
					if (new Headers(options.headers).get('authorization') !== 'token synthetic-token-canary') throw new Error('Unexpected credential');
					return fixture.fetch(url, options);
				};
				process.argv = ['node', 'cli.js', ...${JSON.stringify(args ?? ["--source", source, "--token-file", symbolic ? join(directory, "token-link") : token, ...(format ? ["--format", format] : []), ...(initialize ? ["--init-policy", "--scope", "professional-internal", "--exclude", "client/project"] : [])])}];
				await import(${JSON.stringify(new URL("../../src/adapters/cli.js", import.meta.url).href)});
			`;
			const result = spawnSync(
				process.execPath,
				["--input-type=module", "--eval", setup],
				{
					encoding: "utf8",
					timeout: 5000,
					env: {
						...process.env,
						GH_TOKEN: "ambient-token-canary",
						GITHUB_TOKEN: "ambient-token-canary",
					},
				},
			);
			return {
				...result,
				source:
					existsSync(source) && !malformed && namedPipe !== "source"
						? JSON.parse(readFileSync(source, "utf8"))
						: undefined,
				mode: existsSync(source) ? statSync(source).mode & 0o777 : undefined,
			};
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}
}
