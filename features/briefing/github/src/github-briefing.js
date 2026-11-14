import { GitHubBriefing } from "./application/github-briefing.js";
import { GitHubSource } from "./adapters/github-source.js";

export { GitHubBriefingText } from "./adapters/briefing-text.js";
export { BriefingUnavailableError } from "./domain/source-policy.js";

export function createGitHubBriefing() {
	return new GitHubBriefing((policy, token) => new GitHubSource(policy, token));
}
