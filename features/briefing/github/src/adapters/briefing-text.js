import { stripVTControlCharacters } from "node:util";
import { BriefingRelevance } from "../domain/briefing-relevance.js";

const itemLimit = 5;
const detailLimit = 3;
const categories = [
	"Needs attention",
	"In progress",
	"Open or unresolved work",
];

export class GitHubBriefingText {
	#relevance = new BriefingRelevance();

	render(snapshot) {
		const groups = snapshot.repositories.flatMap((repository) =>
			this.#groups(repository),
		);
		groups.sort(
			(left, right) =>
				left.priority - right.priority ||
				right.updated - left.updated ||
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
					? "No current work in the admitted source reads."
					: "No current work could be summarized from the incomplete source reads.",
			);
		else {
			const selected = groups.slice(0, itemLimit);
			const running = groups.find(({ priority }) => priority === 1);
			if (running && !selected.includes(running))
				selected[itemLimit - 1] = running;
			lines.push(
				`Grouped items by category: ${categories
					.map((category, priority) => [
						category,
						groups.filter((group) => group.priority === priority).length,
					])
					.filter(([, count]) => count > 0)
					.map(([category, count]) => `${category}: ${count}`)
					.join("; ")}.`,
				`Showing ${selected.length} of ${groups.length} grouped items. Attention signals first, with one place reserved for in-progress work; recent activity first within each category.`,
				"",
			);
			for (const [index, group] of selected.entries())
				lines.push(...this.#item(group, index + 1), "");
		}
		lines.push(
			"Use --format json for all collected evidence, attempts and coverage details.",
		);
		return `${lines.join("\n")}\n`;
	}

	#groups(repository) {
		const current = this.#relevance.select(repository);
		const records = new Map();
		const edges = new Map();
		const add = (key, fields) => {
			records.set(key, { ...records.get(key), key, ...fields });
			if (!edges.has(key)) edges.set(key, new Set());
		};
		for (const work of current.items)
			add(`${work.kind}:${work.number}`, { kind: work.kind, work });
		for (const task of current.tasks)
			add(`task:${task.id}`, { kind: "task", task });
		for (const context of current.contexts) {
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
			const signals = nodes.map((node) => this.#relevance.signals(node));
			const priority = Math.min(...signals.map((value) => value.priority));
			const dates = nodes
				.flatMap(({ task, work, context }) => [
					task?.updatedAt ?? task?.createdAt,
					context?.updatedAt,
					work?.updatedAt,
					...(task?.sessions ?? []).map(
						(session) => session.updatedAt ?? session.createdAt,
					),
				])
				.filter(Boolean);
			groups.push({
				key: `${repository.id}:${key}`,
				repository: repository.fullName,
				nodes,
				priority,
				updated: Math.max(...dates.map(Date.parse)),
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
			`   Latest source activity: ${Number.isFinite(group.updated) ? new Date(group.updated).toISOString() : "not available"}.`,
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
					const sessions = this.#relevance
						.sessions(task)
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
