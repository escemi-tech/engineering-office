import { createBriefingServer } from "./briefing-server.js";

const connector = createBriefingServer({ directory: "/run/briefing" });
const server = connector.app.listen(8080, "0.0.0.0");
for (const signal of ["SIGTERM", "SIGINT"])
	process.once(signal, async () => {
		server.close();
		await connector.close();
		server.closeAllConnections();
	});
