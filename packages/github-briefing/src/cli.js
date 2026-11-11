import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { parseArgs } from "node:util";
import { GitHubBriefingText } from "./briefing-text.js";
import { BriefingUnavailableError, GitHubBriefing } from "./github-briefing.js";

async function readProtectedFile(filename, maxBytes) {
	const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const stat = await file.stat();
		if (
			!stat.isFile() ||
			stat.uid !== process.getuid() ||
			stat.mode & 0o077 ||
			stat.size > maxBytes
		) {
			throw new BriefingUnavailableError(
				"Source policy and token must be owner-only regular files within size limits.",
			);
		}
		const buffer = Buffer.alloc(maxBytes + 1);
		const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
		if (bytesRead > maxBytes)
			throw new BriefingUnavailableError("Local input exceeds its size limit.");
		return buffer.toString("utf8", 0, bytesRead);
	} finally {
		await file.close();
	}
}

try {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			source: { type: "string" },
			"token-file": { type: "string" },
			format: { type: "string", default: "json" },
		},
	});
	if (
		!values.source ||
		!values["token-file"] ||
		!["json", "text"].includes(values.format)
	) {
		throw new BriefingUnavailableError(
			"Usage: briefing --source <policy.json> --token-file <token-file> [--format json|text]",
		);
	}
	const policy = JSON.parse(
		await readProtectedFile(values.source, 1024 * 1024),
	);
	const token = (await readProtectedFile(values["token-file"], 16384)).trim();
	const snapshot = await new GitHubBriefing().collect({ policy, token });
	process.stdout.write(
		values.format === "text"
			? new GitHubBriefingText().render(snapshot)
			: `${JSON.stringify(snapshot, null, 2)}\n`,
	);
} catch (error) {
	process.stderr.write(
		`${error instanceof BriefingUnavailableError ? error.message : "GitHub briefing unavailable. Check arguments and protected local input files."}\n`,
	);
	process.exitCode = 1;
}
