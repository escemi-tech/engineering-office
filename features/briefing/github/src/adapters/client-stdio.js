import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createClientServer } from "./client-server.js";
import { HermesBriefingClient } from "./hermes-client.js";
import { readProtectedFile } from "./protected-input.js";

// Read the gateway credential for each request; never retain a removed local key.
const url = process.env.HERMES_GATEWAY_URL ?? "http://127.0.0.1:8642";
if (!["http://127.0.0.1:8642", "http://hermes:8642"].includes(url))
	throw new Error("Unsupported private Hermes gateway.");
const client = new HermesBriefingClient(url, async () =>
	(await readProtectedFile("/run/hermes/key", 16384)).trim(),
);
const server = createClientServer(client);
for (const signal of ["SIGTERM", "SIGINT"])
	process.once(signal, () => void server.close());
await server.connect(new StdioServerTransport());
