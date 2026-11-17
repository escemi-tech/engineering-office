import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { suite, test } from "node:test";

suite("Native tunnel discovery", () => {
	test("discovers briefing tools when the caller omits the initialized notification", {
		timeout: 15000,
	}, async (t) => {
		// Arrange: real tunnel and MCP server, isolated control plane, no real credentials or inference.
		const requests = [
			{
				id: "discover",
				method: "server/discover",
				params: {
					_meta: {
						"io.modelcontextprotocol/protocolVersion": "2026-07-28",
						"io.modelcontextprotocol/clientCapabilities": {},
					},
				},
			},
			...[1, 0].map((id) => ({
				id,
				method: "initialize",
				params: {
					protocolVersion: "2025-11-25",
					capabilities: {},
					clientInfo: { name: "discovery-fixture", version: "1" },
				},
			})),
			{ id: 2, method: "tools/list", params: {} },
		];
		const responses = [];
		let pending,
			next = 0;
		const completed = Promise.withResolvers();
		const dispatch = () => {
			if (!pending || next !== responses.length || next === requests.length)
				return;
			pending.end(
				JSON.stringify({
					commands: [
						{
							command_type: "jsonrpc",
							request_id: `discovery-${next}`,
							shard_token: `discovery-${next}`,
							created_at: new Date().toISOString(),
							jsonrpc: { jsonrpc: "2.0", ...requests[next++] },
						},
					],
				}),
			);
			pending = undefined;
		};
		const server = createServer(async (request, response) => {
			response.setHeader("content-type", "application/json");
			if (request.method === "GET" && request.url.includes("/poll")) {
				pending = response;
				dispatch();
			} else if (
				request.method === "POST" &&
				request.url.endsWith("/response")
			) {
				let body = "";
				for await (const chunk of request) body += chunk;
				responses.push(JSON.parse(body));
				response.end("{}");
				dispatch();
				if (responses.length === requests.length) completed.resolve();
			} else {
				response.writeHead(404).end("{}");
			}
		});
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const child = spawn(
			"tunnel-client",
			[
				"run",
				"--config",
				"/run/hermes/tunnel.yaml",
				"--control-plane.base-url",
				`http://127.0.0.1:${server.address().port}`,
				"--health.listen-addr",
				"127.0.0.1:0",
			],
			{ stdio: ["ignore", "ignore", "pipe"] },
		);
		let diagnostics = "";
		child.stderr.on("data", (chunk) => {
			diagnostics = (diagnostics + chunk).slice(-4096);
		});
		const closed = once(child, "close");
		t.after(async () => {
			server.closeAllConnections();
			server.close();
			child.kill("SIGTERM");
			const timeout = setTimeout(() => child.kill("SIGKILL"), 2000);
			try {
				await closed;
			} finally {
				clearTimeout(timeout);
			}
		});
		// Act: discovery falls back to initialize, then lists tools without a caller notification.
		await Promise.race([
			completed.promise,
			closed.then(() => {
				throw new Error(`Tunnel exited: ${diagnostics}`);
			}),
			new Promise((_, reject) =>
				t.signal.addEventListener("abort", () => reject(t.signal.reason), {
					once: true,
				}),
			),
		]);
		// Assert: the production profile completes the handshake and returns the real tool catalog.
		const result = responses.at(-1);
		assert.equal(result.resp_code, 200, JSON.stringify(result));
		const rpc = result.resp_json;
		assert.equal(rpc.error, undefined);
		assert.deepEqual(rpc.result.tools.map(({ name }) => name).sort(), [
			"cancel_github_briefing",
			"forget_github_briefing",
			"get_github_briefing",
			"start_github_briefing",
		]);
	});
});
