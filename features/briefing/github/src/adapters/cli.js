import { open } from "node:fs/promises";
import { parseArgs } from "node:util";
import { readProtectedFile } from "./protected-input.js";
import { GitHubBriefingText } from "./briefing-text.js";
import {
	BriefingUnavailableError,
	createGitHubBriefing,
} from "../github-briefing.js";

try {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			source: { type: "string" },
			"token-file": { type: "string" },
			format: { type: "string", default: "json" },
			"init-policy": { type: "boolean", default: false },
			scope: { type: "string" },
			exclude: { type: "string", multiple: true, default: [] },
		},
	});
	if (
		!values.source ||
		!values["token-file"] ||
		!["json", "text"].includes(values.format) ||
		(values["init-policy"]
			? !values.scope
			: values.scope || values.exclude.length)
	) {
		throw new BriefingUnavailableError(
			"Usage: briefing --source <policy.json> --token-file <token-file> [--format json|text] [--init-policy --scope <scope> --exclude <owner/repo> ...]",
		);
	}
	const token = (await readProtectedFile(values["token-file"], 16384)).trim();
	const briefing = createGitHubBriefing();
	if (values["init-policy"]) {
		const policy = await briefing.createPolicy({
			token,
			scope: values.scope,
			exclude: values.exclude,
		});
		const file = await open(values.source, "wx", 0o600);
		try {
			await file.writeFile(`${JSON.stringify(policy, null, 2)}\n`);
		} finally {
			await file.close();
		}
		process.stderr.write(
			`Created protected policy for ${policy.repositories.length} repositories. Review it before collection.\n`,
		);
	} else {
		const policy = JSON.parse(
			await readProtectedFile(values.source, 1024 * 1024),
		);
		const snapshot = await briefing.collect({ policy, token });
		process.stdout.write(
			values.format === "text"
				? new GitHubBriefingText().render(snapshot)
				: `${JSON.stringify(snapshot, null, 2)}\n`,
		);
	}
} catch (error) {
	process.stderr.write(
		`${error instanceof BriefingUnavailableError ? error.message : "GitHub briefing unavailable. Check arguments and protected local input files."}\n`,
	);
	process.exitCode = 1;
}
