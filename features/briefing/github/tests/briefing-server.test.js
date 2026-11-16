import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, suite, test } from "node:test";
import {
	Client,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createBriefingServer } from "../src/github-briefing.js";
import { GitHubApiFixture } from "./helpers/github-api.js";

suite("Authenticated briefing connector", () => {
	let api, directory, url, client, fetchHttp, connector;
	const connectorKey = "synthetic-connector-key-distinct-from-github";
	beforeEach(async (t) => {
		// Arrange: real MCP HTTP transport, synthetic GitHub boundary.
		api = new GitHubApiFixture();
		directory = await mkdtemp(join(tmpdir(), "briefing-connector-"));
		for (const [name, value] of Object.entries({
			"source.json": JSON.stringify(api.policy),
			"github-token": "synthetic-token-canary",
			"connector-key": connectorKey,
		}))
			await writeFile(join(directory, name), value, { mode: 0o600 });
		connector = createBriefingServer({ directory });
		const server = connector.app.listen(0, "127.0.0.1");
		await once(server, "listening");
		url = new URL(`http://127.0.0.1:${server.address().port}/mcp`);
		fetchHttp = globalThis.fetch;
		t.mock.method(globalThis, "fetch", (target, options) => {
			if (new URL(target).origin === "https://api.github.com")
				return api.fetch(target, options);
			assert.equal(new URL(target).origin, url.origin);
			return fetchHttp(target, options);
		});
		client = new Client({ name: "synthetic-hermes", version: "1.0.0" });
		t.after(async () => {
			await client.close();
			await connector.close();
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
			await rm(directory, { recursive: true, force: true });
		});
		await client.connect(
			new StreamableHTTPClientTransport(url, {
				requestInit: { headers: { authorization: `Bearer ${connectorKey}` } },
				fetch: fetchHttp,
			}),
		);
	});

	test("exposes one read-only tool and collects new evidence on each invocation", async () => {
		// Arrange
		const invocation = { name: "read_github_briefing", arguments: {} };
		// Act
		const tools = await client.listTools();
		const first = await client.callTool(invocation);
		const count = api.requests.length;
		const second = await client.callTool(invocation);
		// Assert
		assert.deepEqual(
			tools.tools.map(({ name }) => name),
			[invocation.name],
		);
		assert.equal(tools.tools[0].annotations.readOnlyHint, true);
		assert.equal(first.isError, undefined);
		assert.match(first.content[0].text, /Scope: professional-internal/u);
		assert.match(second.content[0].text, /Coverage: complete/u);
		assert.equal(api.requests.length, count * 2);
		assert.doesNotMatch(
			JSON.stringify([first, second, tools]),
			/synthetic-token-canary|synthetic-connector-key/u,
		);
	});

	test("rejects unauthenticated requests, hostile origins and non-MCP paths", async () => {
		// Arrange
		const headers = { authorization: `Bearer ${connectorKey}` };
		// Act
		const absent = await fetchHttp(url);
		const wrong = await fetchHttp(url, {
			headers: { authorization: "Bearer wrong" },
		});
		const origin = await fetchHttp(url, {
			headers: { ...headers, origin: "https://attacker.example" },
		});
		const arbitrary = await fetchHttp(new URL("/github/user", url), {
			headers,
		});
		// Assert
		assert.equal(absent.status, 401);
		assert.equal(wrong.status, 401);
		assert.equal(origin.status, 403);
		assert.equal(arbitrary.status, 404);
		assert.equal(api.requests.length, 0);
	});

	test("rejects model-selected commands, repositories and arbitrary tools before collection", async () => {
		// Arrange
		const calls = [
			{
				name: "read_github_briefing",
				arguments: {
					command: "cat /run/briefing/github-token",
					repositories: ["outside/scope"],
				},
			},
			{
				name: "http_request",
				arguments: { url: "https://api.github.com/user" },
			},
		];
		// Act and Assert
		for (const call of calls) {
			try {
				const result = await client.callTool(call);
				assert.equal(result.isError, true);
			} catch (error) {
				assert.match(
					error.message,
					/not found|Unknown tool|validation|Invalid/iu,
				);
			}
		}
		assert.equal(api.requests.length, 0);
	});

	test("does not substitute a previous result after source or connector credential removal", async () => {
		// Arrange
		await client.callTool({ name: "read_github_briefing", arguments: {} });
		const count = api.requests.length;
		await rm(join(directory, "github-token"));
		// Act
		const unavailable = await client.callTool({
			name: "read_github_briefing",
			arguments: {},
		});
		await rm(join(directory, "connector-key"));
		const revoked = await fetchHttp(url, {
			headers: { authorization: `Bearer ${connectorKey}` },
		});
		// Assert
		assert.equal(unavailable.isError, true);
		assert.doesNotMatch(
			unavailable.content[0].text,
			/Synthetic|work\/project|client\/project/u,
		);
		assert.equal(api.requests.length, count);
		assert.equal(revoked.status, 401);
	});

	test("rejects other trust domains before any GitHub request", async () => {
		// Arrange
		await writeFile(
			join(directory, "source.json"),
			JSON.stringify({ ...api.policy, scope: "personal" }),
		);
		// Act
		const result = await client.callTool({
			name: "read_github_briefing",
			arguments: {},
		});
		// Assert
		assert.equal(result.isError, true);
		assert.match(result.content[0].text, /professional-internal/u);
		assert.equal(api.requests.length, 0);
	});

	test("discards results when the operator changes admission during collection", async () => {
		// Arrange
		const fetchGitHub = api.fetch;
		let changed = false;
		api.fetch = async (...args) => {
			const response = await fetchGitHub(...args);
			if (!changed) {
				changed = true;
				await writeFile(
					join(directory, "source.json"),
					JSON.stringify({
						...api.policy,
						repositories: [api.policy.repositories[0]],
					}),
				);
			}
			return response;
		};
		// Act
		const result = await client.callTool({
			name: "read_github_briefing",
			arguments: {},
		});
		// Assert
		assert.equal(result.isError, true);
		assert.match(result.content[0].text, /access changed/u);
		assert.doesNotMatch(
			result.content[0].text,
			/Synthetic|work\/project|client\/project/u,
		);
	});

	test("rejects concurrent collection and aborts source requests on connector shutdown", {
		timeout: 5000,
	}, async () => {
		// Arrange
		const entered = Promise.withResolvers();
		const aborted = Promise.withResolvers();
		const original = api.fetch;
		let firstRequest = true;
		api.fetch = async (url, options) => {
			if (!firstRequest) return original(url, options);
			firstRequest = false;
			entered.resolve();
			return new Promise((_resolve, reject) =>
				options.signal.addEventListener(
					"abort",
					() => {
						aborted.resolve();
						reject(options.signal.reason);
					},
					{ once: true },
				),
			);
		};
		const invocation = { name: "read_github_briefing", arguments: {} };
		const pending = client.callTool(invocation);
		await entered.promise;
		// Act
		const concurrent = await client.callTool(invocation);
		await connector.close();
		const interrupted = await pending;
		await aborted.promise;
		// Assert
		assert.equal(concurrent.isError, true);
		assert.match(concurrent.content[0].text, /already running/u);
		assert.equal(interrupted.isError, true);
	});
});
