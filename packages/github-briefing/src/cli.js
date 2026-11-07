import { BriefingUnavailableError, GitHubBriefing } from "./github-briefing.js";

try {
	if (process.argv.length !== 2) {
		throw new BriefingUnavailableError(
			"This command accepts no arguments; source changes require review of source.json.",
		);
	}
	const snapshot = await new GitHubBriefing().collect();
	process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
} catch (error) {
	process.stderr.write(
		`${error instanceof BriefingUnavailableError ? error.message : "GitHub briefing unavailable. Check the local setup."}\n`,
	);
	process.exitCode = 1;
}
