const attentionStates = {
	waiting_for_user: "waiting for you",
	failed: "failed",
	timed_out: "timed out",
};

export class BriefingRelevance {
	select(repository) {
		const contexts = repository.pullRequests?.items ?? [];
		const finished = new Set(
			contexts
				.filter((context) => this.#finished(context))
				.map(({ number }) => number),
		);
		return {
			items: repository.items.filter(
				({ kind, number }) => kind !== "pull-request" || !finished.has(number),
			),
			contexts: contexts.filter(({ number }) => !finished.has(number)),
			tasks: (repository.copilot?.tasks ?? []).filter((task) => {
				const linked = contexts.filter(({ taskIds }) =>
					taskIds.includes(task.id),
				);
				const unresolved = repository.pullRequests?.unresolvedArtifacts.some(
					({ taskIds }) => taskIds.includes(task.id),
				);
				const active = [task, ...this.#currentSessions(task)].some(
					({ state }) =>
						["queued", "in_progress", "waiting_for_user"].includes(state),
				);
				if (active || unresolved || task.sessionCoverage.status !== "complete")
					return true;
				// A completed PR supersedes historical task failures, not current activity.
				if (linked.length)
					return linked.some((context) => !this.#finished(context));
				return this.signals({ kind: "task", task }).priority === 0;
			}),
		};
	}

	#finished(context) {
		return (
			context.status === "complete" &&
			["CLOSED", "MERGED"].includes(context.state)
		);
	}

	#currentSessions(task) {
		const latest = this.sessions(task);
		return latest.filter(
			(session) =>
				Date.parse(session.createdAt) === Date.parse(latest[0].createdAt),
		);
	}

	signals({ kind, task, work, context }) {
		const reasons = [];
		if (kind === "task") {
			if (attentionStates[task.state])
				reasons.push(`Copilot task ${attentionStates[task.state]}`);
			const current = this.#currentSessions(task);
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
				priority: active ? 1 : 2,
				reasons: [
					active
						? "Copilot work queued or running"
						: `Copilot task ${task.state}`,
				],
			};
		}
		if (context?.reviewDecision === "CHANGES_REQUESTED")
			reasons.push("Changes requested");
		if (["ERROR", "FAILURE"].includes(context?.checks?.state))
			reasons.push(`CI reports ${context.checks.state.toLowerCase()}`);
		if (work?.reasons.includes("review-requested"))
			reasons.push("Review requested from you or a team (search result)");
		const priority = reasons.length ? 0 : 2;
		if (work?.reasons.includes("mentioned"))
			reasons.push("Mentioned (search result)");
		if (work?.reasons.includes("author-search"))
			reasons.push("Authored or delegated (search result)");
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

	sessions(task) {
		return [...task.sessions].sort(
			(left, right) =>
				Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
				left.id.localeCompare(right.id, "en"),
		);
	}
}
