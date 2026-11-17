import assert from "node:assert/strict";
import { after, suite, test } from "node:test";
import { HermesBriefingClient } from "/app/src/adapters/hermes-client.js";

const url = "http://hermes:8642";
const key = "synthetic-gateway-key-for-briefing-tests-only";
const client = new HermesBriefingClient(url, key);
const headers = {
	authorization: `Bearer ${key}`,
	"content-type": "application/json",
};
async function api(path, method = "GET", body) {
	const response = await fetch(`${url}${path}`, {
		headers,
		method,
		...(body ? { body: JSON.stringify(body) } : {}),
		signal: AbortSignal.timeout(15000),
	});
	assert.equal(response.ok, true, `${method} ${path}: ${response.status}`);
	return response.json();
}
async function mode(value) {
	const response = await fetch("http://127.0.0.1:8081/fixture/mode", {
		method: "POST",
		body: value,
	});
	assert.equal(response.ok, true);
}
suite("Hosted native briefing lifecycle", { timeout: 180000 }, () => {
	after(async () => {
		await mode("normal");
		await client.cleanup({ erase: true });
	});
	test("returns fresh scoped evidence, progress and automatic conversation deletion", async () => {
		// Arrange
		await mode("normal");
		const progress = [];
		// Act
		const result = await client.collect({
			progress: (value) => progress.push(value.status),
		});
		const sessions = await api("/api/sessions?limit=200");
		// Assert
		assert.match(result, /Coverage: complete/u);
		assert.match(result, /https:\/\/github.com\/work\/project/u);
		assert.match(result, /Observed:/u);
		assert.ok(progress.includes("completed"));
		assert.equal(
			sessions.data.filter(({ id }) => id.startsWith("office-briefing-"))
				.length,
			0,
		);
		assert.doesNotMatch(
			result,
			/synthetic-token-canary|synthetic-connector-key/u,
		);
	});
	test("retains partial coverage even when only some source reads fail", async () => {
		// Arrange
		await mode("partial");
		// Act
		const result = await client.collect();
		// Assert
		assert.match(result, /Coverage: partial/u);
	});
	test("resumes a client briefing through native runs and revokes retrieval after deletion", async () => {
		// Arrange
		await mode("normal");
		// Act: reconnect without copying any local task state.
		const { runId } = await client.start();
		const reconnected = new HermesBriefingClient(url, key);
		let result;
		for (let attempt = 0; attempt < 30; attempt++) {
			result = await reconnected.status(runId);
			if (result.status !== "running") break;
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
		// Assert
		assert.equal(result.status, "completed");
		assert.match(result.output, /Coverage: complete/u);
		assert.match(result.output, /https:\/\/github.com\/work\/project/u);
		assert.deepEqual(await reconnected.forget(runId), { runId, deleted: true });
		await assert.rejects(reconnected.status(runId));
	});
	for (const failure of [
		"source-outage",
		"source-revoked",
		"model-outage",
		"attack",
		"no-tool",
	]) {
		test(`withholds a ${failure} result without reusing previous evidence`, async () => {
			// Arrange
			await mode(failure);
			// Act
			const result = client.collect();
			// Assert
			await assert.rejects(result);
			const sessions = await api("/api/sessions?limit=200");
			assert.equal(
				sessions.data.filter(({ id }) => id.startsWith("office-briefing-"))
					.length,
				0,
			);
		});
	}
	test("rejects unauthenticated gateway access", async () => {
		// Arrange
		const options = {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ input: "Read private work" }),
		};
		// Act
		const response = await fetch(`${url}/v1/runs`, options);
		// Assert
		assert.equal(response.status, 401);
	});
	test("purges abandoned feature conversations while preserving another conversation", async () => {
		// Arrange
		await api("/api/sessions", "POST", { id: "unrelated-synthetic-session" });
		await api("/api/sessions", "POST", { id: "office-briefing-abandoned" });
		// Act
		await client.cleanup({ erase: true });
		const sessions = await api("/api/sessions?limit=200");
		// Assert
		assert.ok(
			sessions.data.some(({ id }) => id === "unrelated-synthetic-session"),
		);
		assert.equal(
			sessions.data.filter(({ id }) => id.startsWith("office-briefing-"))
				.length,
			0,
		);
		// Keep this unrelated conversation for the native receipt expiry/restart check.
	});
});
