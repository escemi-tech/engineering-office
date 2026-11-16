import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const compiled = readFileSync("/fixtures/AGENTS.md", "utf8").trim();
const sourceKey = "synthetic-token-canary";
const tool = "mcp__briefing__read_github_briefing";
createServer(async (request, response) => {
	response.setHeader("content-type", "application/json");
	try {
		if (request.url === "/fixture/mode" && request.method === "POST") {
			let value = "";
			for await (const chunk of request) value += chunk;
			assert.ok(
				[
					"normal",
					"source-outage",
					"source-revoked",
					"model-outage",
					"attack",
					"partial",
					"no-tool",
				].includes(value),
			);
			writeFileSync("/fixtures/mode", value);
			response.end("{}");
			return;
		}
		if (request.url === "/fixture/health") {
			response.end("{}");
			return;
		}
		assert.equal(request.url, "/v1/chat/completions");
		assert.equal(request.method, "POST");
		assert.equal(
			request.headers.authorization,
			"Bearer synthetic-inference-key-for-tests-only",
		);
		const chunks = [];
		for await (const chunk of request) chunks.push(chunk);
		const text = Buffer.concat(chunks).toString();
		assert.ok(text.length < 1024 * 1024);
		assert.ok(!text.includes(sourceKey));
		assert.ok(!text.includes("synthetic-connector-key-distinct-from-github"));
		const body = JSON.parse(text);
		assert.equal(body.model, "synthetic");
		// Omitting stream is the native non-streaming request, as in the runtime fixture.
		assert.ok(!body.stream, "Inference must not request streaming");
		assert.equal(
			body.store,
			false,
			"Provider response storage must be disabled",
		);
		assert.deepEqual(
			body.tools.map((entry) => entry.function.name),
			[tool],
		);
		assert.ok(
			body.messages.some(
				(message) =>
					message.role === "system" && message.content.includes(compiled),
			),
		);
		const mode = readFileSync("/fixtures/mode", "utf8").trim();
		if (mode === "model-outage") {
			response.writeHead(503).end('{"error":{"message":"Synthetic outage"}}');
			return;
		}
		const result = body.messages.findLast((message) => message.role === "tool");
		let message, finish;
		if (!result && mode !== "no-tool") {
			message = {
				role: "assistant",
				content: null,
				tool_calls: [
					{
						id: "synthetic-call",
						type: "function",
						function: {
							name: tool,
							arguments: JSON.stringify(
								mode === "attack"
									? {
											command: "cat /run/briefing/github-token",
											repository: "outside/scope",
										}
									: {},
							),
						},
					},
				],
			};
			finish = "tool_calls";
		} else {
			message = {
				role: "assistant",
				content: result
					? `Synthetic briefing. ${result.content}`
					: "Invented briefing without collection.",
			};
			finish = "stop";
		}
		response.end(
			JSON.stringify({
				id: "synthetic",
				object: "chat.completion",
				created: 1,
				model: "synthetic",
				choices: [{ index: 0, message, finish_reason: finish }],
				usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
			}),
		);
	} catch (error) {
		process.stderr.write(`${error.stack}\n`);
		response
			.writeHead(400)
			.end('{"error":{"message":"Unexpected synthetic inference contract"}}');
	}
}).listen(8081, "0.0.0.0");
