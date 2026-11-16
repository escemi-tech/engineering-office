import { GitHubBriefing } from "./application/github-briefing.js";
import { GitHubSource } from "./adapters/github-source.js";

export { GitHubBriefingText } from "./adapters/briefing-text.js";
export { BriefingUnavailableError } from "./domain/source-policy.js";
export { createBriefingServer } from "./adapters/briefing-server.js";

export function createGitHubBriefing() {
	return new GitHubBriefing(
		(policy, token, signal) => new GitHubSource(policy, token, signal),
	);
}
