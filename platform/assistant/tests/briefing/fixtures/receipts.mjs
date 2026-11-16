import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

// This fixture only runs against the disposable VM's synthetic state volume.
const age = process.argv[2] === "age";
const db = new DatabaseSync("/state/state.db", { readOnly: !age });
const record = "/state/briefing-fixture-receipts.json";
try {
	if (age) {
		// Arrange: Hermes is stopped; age synthetic receipts instead of waiting a week.
		const receipts = db
			.prepare("SELECT key, value FROM state_meta WHERE key LIKE ?")
			.all("gateway.terminal_admission.v1.%")
			.map(({ key, value }) => ({ key, value: JSON.parse(value) }))
			.filter(({ value }) =>
				value.target_session_id?.startsWith("office-briefing-"),
			);
		assert.ok(receipts.length >= 2, "Native deleted-session receipts exist");
		const [fresh, ...expired] = receipts;
		for (const receipt of expired) {
			receipt.value.retired_at = Date.now() / 1000 - 8 * 86400;
			db.prepare("UPDATE state_meta SET value=? WHERE key=?").run(
				JSON.stringify(receipt.value),
				receipt.key,
			);
		}
		const updated = db
			.prepare("UPDATE sessions SET started_at=?, ended_at=? WHERE id=?")
			.run(1, 2, "unrelated-synthetic-session");
		assert.equal(updated.changes, 1);
		writeFileSync(record, JSON.stringify({ fresh, expired }), { mode: 0o600 });
	} else {
		// Act: the preceding systemd invocation used the production native owner RPC.
		const { fresh, expired } = JSON.parse(readFileSync(record, "utf8"));
		const lookup = db.prepare("SELECT value FROM state_meta WHERE key=?");
		// Assert: expired content is removed, fresh receipts and unrelated work survive.
		assert.ok(lookup.get(fresh.key));
		for (const { key, value } of expired) {
			assert.equal(lookup.get(key), undefined);
			assert.equal(
				lookup.get(`gateway.admission.result.v1.${value.admission_id}`),
				undefined,
			);
		}
		assert.ok(
			db
				.prepare("SELECT id FROM sessions WHERE id=?")
				.get("unrelated-synthetic-session"),
		);
	}
} finally {
	db.close();
}
