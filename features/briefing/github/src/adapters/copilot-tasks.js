import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u);
const identity = z.object({ id: z.int().positive() });
const state = z.enum([
	"queued",
	"in_progress",
	"completed",
	"failed",
	"idle",
	"waiting_for_user",
	"timed_out",
	"cancelled",
]);
const timestamp = z.iso
	.datetime()
	.refine((value) => Date.parse(value) <= Date.now());
const artifact = z.discriminatedUnion("type", [
	z.object({
		provider: z.literal("github"),
		type: z.literal("pull"),
		data: z.object({
			id: z.int().positive(),
			global_id: z.string().max(256).optional(),
		}),
	}),
	z.object({
		provider: z.literal("github"),
		type: z.literal("branch"),
		data: z.object({
			head_ref: z.string().max(1024),
			base_ref: z.string().max(1024),
		}),
	}),
]);
const session = z.object({
	id,
	state,
	task_id: id.optional(),
	repository: identity.optional(),
	created_at: timestamp,
	updated_at: timestamp.optional(),
	completed_at: timestamp.nullable().optional(),
});
const task = z.object({
	id,
	state,
	name: z
		.string()
		.max(1024)
		.refine((value) => value.isWellFormed())
		.optional(),
	creator: identity.optional(),
	repository: identity.optional(),
	url: z.string().optional(),
	html_url: z.string().optional(),
	created_at: timestamp,
	updated_at: timestamp.optional(),
	archived_at: timestamp.nullable().optional(),
	artifacts: z.array(artifact).max(1000).optional(),
	session_count: z.int().nonnegative().optional(),
});
const taskDetails = task.extend({
	sessions: z.array(session).max(1000).optional(),
});
const taskPage = z.object({ tasks: z.array(task).max(100) });

export class CopilotTasks {
	async collect(request, repository, viewer, pageLimit) {
		const result = {
			boundary: "created-by-authenticated-user",
			status: "partial",
			reason: "page-limit",
			tasks: [],
		};
		const listed = new Map();
		const route = `GET /agents/repos/${repository.fullName}/tasks`;
		for (let page = 1; page <= pageLimit; page++) {
			const response = await request(route, {
				creator_id: [viewer.id],
				is_archived: false,
				sort: "updated_at",
				direction: "desc",
				per_page: 100,
				page,
			});
			if (response.failure) {
				result.reason = response.failure;
				if (["http-403", "http-404"].includes(response.failure) || !listed.size)
					return { ...result, status: "unavailable" };
				break;
			}
			const { tasks } = taskPage.parse(response.data);
			for (const current of tasks) {
				this.#validate(current, repository, viewer);
				if (!current.creator) {
					result.reason = "unknown-creator";
					continue;
				}
				if (listed.has(current.id)) result.reason = "changing-results";
				listed.set(current.id, current);
			}
			if (result.reason !== "page-limit") break;
			const next = (response.headers.link ?? "").includes('rel="next"');
			if (!next && tasks.length < 100) {
				result.status = "complete";
				delete result.reason;
				break;
			}
			if (!tasks.length) {
				result.reason = "changing-results";
				break;
			}
		}
		for (const current of listed.values()) {
			const response = await request(`${route}/${current.id}`);
			if (["http-403", "http-404"].includes(response.failure))
				return {
					...result,
					status: "unavailable",
					reason: response.failure,
					tasks: [],
				};
			const evidence = this.#details(current, response, repository, viewer);
			result.tasks.push(evidence);
			if (evidence.sessionCoverage.status !== "complete") {
				result.status = "partial";
				result.reason ??= evidence.sessionCoverage.reason;
			}
		}
		return result;
	}

	#validate(current, repository, viewer) {
		const apiUrl = `https://api.github.com/agents/repos/${repository.fullName}/tasks/${current.id}`;
		const webUrls = ["tasks", "copilot/tasks"].map(
			(path) =>
				`https://github.com/${repository.fullName}/${path}/${current.id}`,
		);
		if (
			(current.repository && current.repository.id !== repository.id) ||
			(current.creator && current.creator.id !== viewer.id) ||
			(current.url && current.url !== apiUrl) ||
			(current.html_url && !webUrls.includes(current.html_url)) ||
			current.archived_at ||
			(current.updated_at &&
				Date.parse(current.updated_at) < Date.parse(current.created_at))
		)
			throw new Error("Inconsistent Copilot task evidence");
	}

	#details(listed, response, repository, viewer) {
		const evidence = this.#project(listed);
		if (response.failure) {
			evidence.sessionCoverage.reason = response.failure;
			return evidence;
		}
		const current = taskDetails.parse(response.data);
		this.#validate(current, repository, viewer);
		if (current.id !== listed.id || current.created_at !== listed.created_at)
			throw new Error("Inconsistent Copilot task identity");
		if (
			!current.creator ||
			(listed.updated_at &&
				(!current.updated_at ||
					Date.parse(current.updated_at) < Date.parse(listed.updated_at)))
		) {
			evidence.sessionCoverage.reason = "unverified-detail";
			return evidence;
		}
		const updated = this.#project(current);
		const sessions = current.sessions ?? [];
		const seen = new Set();
		let invalidSessionTime = false;
		for (const attempt of sessions) {
			if (
				seen.has(attempt.id) ||
				(attempt.task_id && attempt.task_id !== current.id) ||
				(attempt.repository && attempt.repository.id !== repository.id)
			)
				throw new Error("Inconsistent Copilot session evidence");
			seen.add(attempt.id);
			if (
				Date.parse(attempt.created_at) < Date.parse(current.created_at) ||
				[attempt.updated_at, attempt.completed_at].some(
					(value) =>
						value && Date.parse(value) < Date.parse(attempt.created_at),
				)
			) {
				invalidSessionTime = true;
				continue;
			}
			updated.sessions.push({
				id: attempt.id,
				state: attempt.state,
				createdAt: attempt.created_at,
				updatedAt: attempt.updated_at,
				completedAt: attempt.completed_at,
			});
		}
		updated.sessionCoverage =
			current.sessions &&
			!invalidSessionTime &&
			current.session_count === sessions.length
				? { status: "complete", expected: current.session_count }
				: {
						status: "partial",
						reason: invalidSessionTime
							? "inconsistent-session-time"
							: "unverified-sessions",
						expected: current.session_count,
					};
		return updated;
	}

	#project(current) {
		return {
			id: current.id,
			title: current.name,
			url: current.html_url,
			state: current.state,
			createdAt: current.created_at,
			updatedAt: current.updated_at,
			artifacts: current.artifacts?.map((value) =>
				value.type === "pull"
					? { type: "pull", id: value.data.id, globalId: value.data.global_id }
					: {
							type: "branch",
							headRef: value.data.head_ref,
							baseRef: value.data.base_ref,
						},
			),
			sessions: [],
			sessionCoverage: { status: "unavailable" },
		};
	}
}
