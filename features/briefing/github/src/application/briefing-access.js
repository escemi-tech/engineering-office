import {
	BriefingUnavailableError,
	SourcePolicy,
} from "../domain/source-policy.js";

export class BriefingAccess {
	#load;
	#briefing;
	#running = false;

	constructor(load, briefing) {
		this.#load = load;
		this.#briefing = briefing;
	}

	async #inputs() {
		const inputs = await this.#load();
		const policy = new SourcePolicy().parse(inputs.policy);
		if (policy.scope !== "professional-internal")
			throw new BriefingUnavailableError(
				"This connector admits professional-internal sources only.",
			);
		return { ...inputs, policy };
	}

	async ready() {
		await this.#inputs();
	}

	async collect(signal) {
		if (this.#running)
			throw new BriefingUnavailableError(
				"A briefing collection is already running. Retry after it finishes.",
			);
		this.#running = true;
		try {
			const inputs = await this.#inputs();
			signal?.throwIfAborted();
			const snapshot = await this.#briefing.collect({
				policy: inputs.policy,
				token: inputs.token,
				signal,
			});
			signal?.throwIfAborted();
			const current = await this.#inputs();
			if (
				inputs.token !== current.token ||
				inputs.key !== current.key ||
				JSON.stringify(inputs.policy) !== JSON.stringify(current.policy)
			)
				throw new BriefingUnavailableError(
					"Source access changed during collection. No briefing returned.",
				);
			return snapshot;
		} finally {
			this.#running = false;
		}
	}
}
