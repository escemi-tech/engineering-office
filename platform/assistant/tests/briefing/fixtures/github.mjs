import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GitHubApiFixture } from "./github-api.js";

// Test-only preload: production source code still fixes the GitHub origin and reads.
const api = new GitHubApiFixture();
globalThis.fetch = async (url, options) => {
	assert.equal(new URL(url).origin, "https://api.github.com");
	const mode = readFileSync(new URL("./mode", import.meta.url), "utf8").trim();
	if (mode === "source-revoked")
		return Response.json({ message: "Revoked" }, { status: 401 });
	if (mode === "source-outage")
		return Response.json({ message: "Unavailable" }, { status: 503 });
	if (mode === "partial" && new URL(url).pathname.includes("/tasks"))
		return Response.json({ message: "Unavailable" }, { status: 503 });
	return api.fetch(url, options);
};
