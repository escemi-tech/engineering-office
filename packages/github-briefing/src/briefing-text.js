import { stripVTControlCharacters } from "node:util";

const itemLimit = 5;
const detailLimit = 3;
const attentionStates = {
	waiting_for_user: "waiting for you",
	failed: "failed",
	timed_out: "timed out",
};
const categories = [
	"Needs attention",
	"In progress",
	"Open or unresolved work",
	"Completed or inactive",
];

export class GitHubBriefingText {
	render(snapshot) {
		const groups = snapshot.repositories.flatMap((repository) =>
			this.#groups(repository),
		);
		groups.sort(
			(left, right) =>
				left.priority - right.priority ||
				left.updated - right.updated ||
				left.key.localeCompare(right.key, "en"),
		);
		const lines = [
			"GitHub work briefing",
			`Scope: ${snapshot.scope} | Account: ${snapshot.source.account.login}`,
			`Classification: ${snapshot.classification}`,
			`Observed: ${snapshot.observedAt}`,
			`Coverage: ${snapshot.coverage.status}. Credential-visible, admitted sources only.`,
			`Repositories: ${snapshot.repositories.length} admitted; ${snapshot.coverage.unadmittedRepositories} discovered but not admitted.`,
		];
		if (snapshot.coverage.discovery.status !== "complete")
			lines.push(
				`Discovery: ${snapshot.coverage.discovery.status} (${snapshot.coverage.discovery.reason}).`,
			);
		const incomplete = snapshot.repositories.filter(
			({ status }) => status !== "complete",
		);
		for (const repository of incomplete.slice(0, itemLimit))
			lines.push(
				`Coverage warning - ${repository.fullName}: ${this.#coverage(repository)}.`,
			);
		if (incomplete.length > itemLimit)
			lines.push(
				`${incomplete.length - itemLimit} more repositories have incomplete coverage.`,
			);
		lines.push(
			`Outside coverage: ${snapshot.coverage.excluded.map((value) => value.replaceAll("-", " ")).join("; ")}.`,
			"",
		);
		if (!groups.length)
			lines.push(
				snapshot.coverage.status === "complete"
					? "No matching work in the admitted source reads."
					: "No work could be summarized from the incomplete source reads.",
			);
		else {
			lines.push(
				`Showing ${Math.min(itemLimit, groups.length)} of ${groups.length} grouped items. Attention signals first, then older updates within each category.`,
				"",
			);
			for (const [index, group] of groups.slice(0, itemLimit).entries())
				lines.push(...this.#item(group, index + 1), "");
		}
		lines.push(
			"Use --format json for all collected evidence, attempts and coverage details.",
		);
		return `${lines.join("\n")}\n`;
	}

	#groups(repository) {
		const records = new Map();
		const edges = new Map();
		const add = (key, fields) => {
			records.set(key, { ...records.get(key), key, ...fields });
			if (!edges.has(key)) edges.set(key, new Set());
		};
		for (const work of repository.items)
			add(`${work.kind}:${work.number}`, { kind: work.kind, work });
		for (const task of repository.copilot?.tasks ?? [])
			add(`task:${task.id}`, { kind: "task", task });
		for (const context of repository.pullRequests?.items ?? []) {
			const key = `pull-request:${context.number}`;
			add(key, { kind: "pull-request", context });
			for (const id of context.taskIds) {
				const taskKey = `task:${id}`;
				if (!records.has(taskKey)) continue;
				edges.get(key).add(taskKey);
				edges.get(taskKey).add(key);
			}
		}
		const seen = new Set();
		const groups = [];
		for (const key of [...records.keys()].sort()) {
			if (seen.has(key)) continue;
			const pending = [key];
			const nodes = [];
			while (pending.length) {
				const current = pending.pop();
				if (seen.has(current)) continue;
				seen.add(current);
				nodes.push(records.get(current));
				pending.push(...edges.get(current));
			}
			nodes.sort((a, b) => a.key.localeCompare(b.key, "en"));
			const signals = nodes.map((node) => this.#signals(node));
			const priority = Math.min(...signals.map((value) => value.priority));
			const dates = nodes
				.map(
					({ task, work, context }) =>
						task?.updatedAt ??
						task?.createdAt ??
						context?.updatedAt ??
						work?.updatedAt,
				)
				.filter(Boolean);
			groups.push({
				key: `${repository.id}:${key}`,
				repository: repository.fullName,
				nodes,
				priority,
				updated: Math.min(...dates.map(Date.parse)),
				reasons: [
					...new Set(
						signals
							.filter((value) => value.priority === priority)
							.flatMap((value) => value.reasons),
					),
				].sort(),
			});
		}
		return groups;
	}

	#signals({ kind, task, work, context }) {
		const reasons = [];
		if (kind === "task") {
			if (attentionStates[task.state])
				reasons.push(`Copilot task ${attentionStates[task.state]}`);
			const latest = this.#sessions(task);
			const current = latest.filter(
				(session) =>
					Date.parse(session.createdAt) === Date.parse(latest[0].createdAt),
			);
			for (const session of current)
				if (attentionStates[session.state] && session.state !== task.state)
					reasons.push(
						`Latest Copilot attempt ${attentionStates[session.state]}`,
					);
			if (reasons.length) return { priority: 0, reasons };
			const active = [task, ...current].some(({ state }) =>
				["queued", "in_progress"].includes(state),
			);
			return {
				priority: active ? 1 : 3,
				reasons: [
					active
						? "Copilot work queued or running"
						: `Copilot task ${task.state}`,
				],
			};
		}
		if (["CLOSED", "MERGED"].includes(context?.state))
			return { priority: 3, reasons: [`PR ${context.state.toLowerCase()}`] };
		if (context?.reviewDecision === "CHANGES_REQUESTED")
			reasons.push("Changes requested");
		if (["ERROR", "FAILURE"].includes(context?.checks?.state))
			reasons.push(`CI reports ${context.checks.state.toLowerCase()}`);
		if (work?.reasons.includes("review-requested"))
			reasons.push("Review requested (search result)");
		const priority = reasons.length ? 0 : 2;
		if (work?.reasons.includes("mentioned"))
			reasons.push("Mentioned (search result)");
		return {
			priority,
			reasons: reasons.length
				? reasons
				: [
						kind === "issue"
							? "Open issue"
							: context?.state === "OPEN"
								? "Open PR"
								: "PR context unavailable",
					],
		};
	}

	#sessions(task) {
		return [...task.sessions].sort(
			(left, right) =>
				Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
				left.id.localeCompare(right.id, "en"),
		);
	}

	#item(group, index) {
		const work = group.nodes.find(({ kind }) => kind !== "task");
		const task = group.nodes[0].task;
		const title = work
			? (work.context?.title ??
				work.work?.title ??
				`Pull request #${work.context.number}`)
			: (task.title ?? `Copilot task ${task.id}`);
		const lines = [
			`${index}. [${categories[group.priority]}] ${group.repository} - ${this.#text(title)}`,
			`   Signals: ${group.reasons.join("; ")}.`,
			`   Oldest source timestamp: ${Number.isFinite(group.updated) ? new Date(group.updated).toISOString() : "not available"}.`,
		];
		for (const kind of ["issue", "pull-request", "task"]) {
			const records = group.nodes.filter((node) => node.kind === kind);
			for (const node of records.slice(0, detailLimit)) {
				if (kind === "issue")
					lines.push(`   Issue #${node.work.number}: ${node.work.url}`);
				else if (kind === "pull-request") {
					const { context } = node;
					const review = context?.reviewDecision ?? "not reported";
					const checks =
						context?.checks?.status === "complete"
							? (context.checks.state ?? "not reported")
							: `unavailable (${context?.checks?.reason ?? context?.reason ?? "not collected"})`;
					lines.push(
						`   PR #${context?.number ?? node.work.number}: ${context?.state ?? "state unavailable"}${context?.draft ? " (draft)" : ""}; review ${review}; CI ${checks}${context?.checks?.headOid ? ` at ${context.checks.headOid.slice(0, 7)}` : ""}. ${context?.url ?? node.work.url}`,
					);
				} else {
					const { task } = node;
					const sessions = this.#sessions(task)
						.slice(0, detailLimit)
						.map((session) => `${session.id}=${session.state}`)
						.join(", ");
					lines.push(
						`   Task ${task.id}: ${task.state}. ${task.url ?? "No task link supplied."}`,
					);
					lines.push(
						`   Attempts: ${task.sessions.length} collected (${task.sessionCoverage.status}); latest first: ${sessions || "none returned"}${task.sessions.length > detailLimit ? ", more in JSON" : ""}.`,
					);
				}
			}
			if (records.length > detailLimit)
				lines.push(
					`   ${records.length - detailLimit} more ${kind} records in this group; see JSON.`,
				);
		}
		return lines;
	}

	#coverage(repository) {
		if (repository.reason) return `${repository.status} (${repository.reason})`;
		const parts = (repository.searches ?? [])
			.filter(({ status }) => status !== "complete")
			.map(
				({ kind, selection, status, reason }) =>
					`${kind} ${selection} ${status} (${reason})`,
			);
		for (const [name, value] of [
			["Copilot", repository.copilot],
			["PR context", repository.pullRequests],
			["access", repository.access],
		]) {
			if (value && value.status !== "complete")
				parts.push(
					`${name} ${value.status}${value.reason ? ` (${value.reason})` : ""}`,
				);
		}
		const unresolved = repository.pullRequests?.unresolvedArtifacts.length ?? 0;
		if (unresolved) parts.push(`${unresolved} unresolved PR references`);
		return parts.join("; ") || repository.status;
	}

	#text(value) {
		const text = stripVTControlCharacters(value)
			.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, (character) =>
				["\u200c", "\u200d"].includes(character) ? character : " ",
			)
			.replace(/\s+/gu, " ")
			.trim();
		return [...text].length > 280
			? `${[...text].slice(0, 280).join("")}...`
			: text;
	}
}
