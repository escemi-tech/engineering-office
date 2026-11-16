import { HermesBriefingClient } from "./hermes-client.js";
import { readProtectedFile } from "./protected-input.js";

try {
	const command = process.argv[2];
	if (
		process.argv.length !== 3 ||
		!["collect", "cleanup", "erase"].includes(command)
	)
		throw new Error("Use collect, cleanup or erase.");
	const key = (await readProtectedFile("/run/hermes/key", 16384)).trim();
	const client = new HermesBriefingClient("http://127.0.0.1:8642", key);
	if (command === "collect") {
		const controller = new AbortController();
		for (const name of ["SIGINT", "SIGTERM"])
			process.once(name, () => controller.abort());
		const output = await client.collect({
			signal: controller.signal,
			progress: ({ status, elapsedSeconds }) =>
				process.stderr.write(`Briefing: ${status} (${elapsedSeconds}s)\n`),
		});
		process.stdout.write(`${output}\n`);
	} else {
		const count = await client.cleanup({ erase: command === "erase" });
		process.stdout.write(`Deleted ${count} briefing conversation(s).\n`);
	}
} catch (error) {
	process.stderr.write(`${error.message}\n`);
	process.exitCode = 1;
}
