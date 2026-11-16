import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { BriefingUnavailableError } from "../domain/source-policy.js";

export async function readProtectedFile(filename, maxBytes) {
	const file = await open(
		filename,
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	);
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
