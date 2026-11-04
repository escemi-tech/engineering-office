import { createServer } from "node:http";

// A synthetic OpenAI-compatible endpoint. Reject accidental tools or real models.
createServer(async (request, response) => {
	response.setHeader("Content-Type", "application/json");
	if (request.url === "/v1/models" && request.method === "GET") {
		response.end(
			JSON.stringify({ data: [{ id: "synthetic", object: "model" }] }),
		);
		return;
	}
	if (request.url !== "/v1/chat/completions" || request.method !== "POST") {
		response.writeHead(404).end("{}");
		return;
	}
	try {
		const chunks = [];
		let bytes = 0;
		for await (const chunk of request) {
			bytes += chunk.length;
			if (bytes > 1024 * 1024) throw new Error("Request exceeds fixture limit");
			chunks.push(chunk);
		}
		const body = JSON.parse(Buffer.concat(chunks).toString());
		if (
			request.headers.authorization !==
				"Bearer synthetic-inference-key-for-tests-only" ||
			body.model !== "synthetic" ||
			body.tools?.length ||
			body.stream ||
			!body.messages?.some((message) => message.role === "user")
		) {
			throw new Error("Unexpected inference contract");
		}
		response.end(
			JSON.stringify({
				id: "synthetic-completion",
				object: "chat.completion",
				created: 1,
				model: "synthetic",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "Synthetic briefing: no connected sources.",
						},
						finish_reason: "stop",
					},
				],
				usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
			}),
		);
	} catch {
		response.writeHead(400).end(
			JSON.stringify({
				error: { message: "Invalid synthetic inference request" },
			}),
		);
	}
}).listen(8080, "0.0.0.0");
