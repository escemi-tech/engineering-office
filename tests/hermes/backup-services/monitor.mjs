import { createServer } from "node:http";

// Contract fixture only: record Healthchecks pings, never implement alerting.
const events = [];
let unavailable = false;
createServer((request, response) => {
	if (request.method === "GET" && request.url === "/events") {
		response.writeHead(200, { "Content-Type": "application/json" });
		response.end(JSON.stringify(events));
		return;
	}
	if (
		request.method === "PUT" &&
		["/available", "/unavailable"].includes(request.url)
	) {
		unavailable = request.url === "/unavailable";
		response.end("OK");
		return;
	}
	if (
		request.method === "POST" &&
		["/ping/fixture", "/ping/fixture/start", "/ping/fixture/fail"].includes(
			request.url,
		)
	) {
		if (unavailable) {
			response.writeHead(503);
			response.end("Unavailable");
			return;
		}
		events.push(request.url.split("/")[3] ?? "success");
		response.end("OK");
		return;
	}
	response.writeHead(404);
	response.end();
}).listen(8080, "0.0.0.0");
