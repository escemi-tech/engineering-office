import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { WritingNormalizer } from "../src/writing-normalizer.js";
import fixtures from "./fixtures/drafts.json" with { type: "json" };

suite("Writing requirements across English and French drafts", () => {
	const normalizer = new WritingNormalizer();

	for (const { name, format, locale, input, expected } of fixtures) {
		test(name, () => {
			// Arrange
			const draft = Object.freeze({
				format,
				locale,
				parts: Object.freeze([Object.freeze({ kind: "prose", text: input })]),
			});

			// Act
			const result = normalizer.normalize(draft);
			const repeated = normalizer.normalize(result);

			// Assert
			assert.equal(result.text, expected);
			assert.equal(result.coverage, "normalized");
			assert.deepEqual(result.warnings, []);
			assert.ok(result.changes > 0);
			assert.equal(draft.parts[0].text, input);
			assert.equal(repeated.text, result.text);
			assert.deepEqual(repeated.parts, result.parts);
			assert.equal(repeated.changes, 0);
			assert.equal(result.engine, "polytypo");
			assert.match(result.engineVersion, /^\d+\.\d+\.\d+$/u);
			assert.match(result.normalizerVersion, /^\d+\.\d+\.\d+$/u);
		});
	}

	for (const locale of ["en-US", "en-GB", "fr", "fr-CA"]) {
		for (const [format, input, expected] of [
			["text/plain", "Review  now...", "Review now…"],
			["text/markdown", "**Review  now...**", "**Review now…**"],
			["text/html", "<p>Review  now...</p>", "<p>Review now…</p>"],
		]) {
			test(`supports ${locale} in ${format}`, () => {
				// Arrange
				const draft = {
					format,
					locale,
					parts: [{ kind: "prose", text: input }],
				};

				// Act
				const result = normalizer.normalize(draft);

				// Assert
				assert.equal(result.text, expected);
				assert.equal(result.coverage, "normalized");
			});
		}
	}

	test("keeps an empty draft valid and unchanged", () => {
		// Arrange
		const draft = { format: "text/plain", locale: "en-US", parts: [] };

		// Act
		const result = normalizer.normalize(draft);

		// Assert
		assert.equal(result.text, "");
		assert.equal(result.changes, 0);
	});
});

suite("Evidence provenance and coverage boundaries", () => {
	const normalizer = new WritingNormalizer();
	const evidence =
		"Exact  source... “Do not edit!” 👩‍💻\u200b\ufeff\n" +
		"customer--id /tmp/a... https://example.test/a...\n" +
		"-- \nSynthetic Signature\nSHA256:synthetic==";

	for (const [
		format,
		protectedText,
		before,
		after,
		expectedBefore,
		expectedAfter,
	] of [
		[
			"text/plain",
			evidence,
			"Review  first...\n",
			"\nEnd  of review...",
			"Review first…\n",
			"\nEnd of review…",
		],
		[
			"text/markdown",
			`> ${evidence}\n`,
			"Review  first...\n\n",
			"\nEnd  of review...",
			"Review first…\n\n",
			"\nEnd of review…",
		],
		[
			"text/html",
			`<blockquote>${evidence}</blockquote>`,
			"<p>Review  first...</p>",
			"<p>End  of review...</p>",
			"<p>Review first…</p>",
			"<p>End of review…</p>",
		],
	]) {
		test(`preserves classified evidence byte for byte in ${format}`, () => {
			// Arrange
			const draft = {
				format,
				locale: "en-US",
				parts: [
					{ kind: "prose", text: before },
					{ kind: "verbatim", text: protectedText },
					{ kind: "prose", text: after },
				],
			};

			// Act
			const result = normalizer.normalize(draft);

			// Assert
			assert.deepEqual(
				Buffer.from(result.parts[1].text),
				Buffer.from(protectedText),
			);
			assert.equal(
				result.text,
				`${expectedBefore}${protectedText}${expectedAfter}`,
			);
			assert.ok(result.changes > 0);
		});
	}

	for (const [format, locale, warnings] of [
		["application/json", "en-US", ["unsupported-format"]],
		["text/mdx", "en-US", ["unsupported-format"]],
		["text/plain", "de", ["unsupported-locale"]],
		["text/plain", "en", ["unsupported-locale"]],
		["unknown", "unknown", ["unsupported-format", "unsupported-locale"]],
	]) {
		test(`passes ${format}/${locale} through with explicit coverage warnings`, () => {
			// Arrange
			const draft = {
				format,
				locale,
				parts: [{ kind: "prose", text: "Raw  content..." }],
			};

			// Act
			const result = normalizer.normalize(draft);

			// Assert
			assert.equal(result.text, draft.parts[0].text);
			assert.deepEqual(result.parts, draft.parts);
			assert.equal(result.coverage, "unsupported");
			assert.deepEqual(result.warnings, warnings);
			assert.equal(result.changes, 0);
		});
	}
});

suite("Input validation", () => {
	const normalizer = new WritingNormalizer();

	for (const [name, draft] of [
		["missing draft", undefined],
		["unclassified text", "sensitive raw text"],
		["missing format", { locale: "en-US", parts: [] }],
		["empty format", { format: "", locale: "en-US", parts: [] }],
		["missing locale", { format: "text/plain", parts: [] }],
		["empty locale", { format: "text/plain", locale: "", parts: [] }],
		["missing parts", { format: "text/plain", locale: "en-US" }],
		["null part", { format: "text/plain", locale: "en-US", parts: [null] }],
		[
			"unknown kind",
			{
				format: "text/plain",
				locale: "en-US",
				parts: [{ kind: "unknown", text: "sensitive raw text" }],
			},
		],
		[
			"non-text part",
			{
				format: "text/plain",
				locale: "en-US",
				parts: [{ kind: "prose", text: 123 }],
			},
		],
		[
			"malformed Unicode",
			{
				format: "text/plain",
				locale: "en-US",
				parts: [{ kind: "verbatim", text: "\uD800" }],
			},
		],
	]) {
		test(`rejects ${name} without echoing the draft`, () => {
			// Arrange
			const failures = [];

			// Act
			try {
				normalizer.normalize(draft);
			} catch (error) {
				failures.push(error);
			}

			// Assert
			assert.equal(failures.length, 1);
			assert.ok(failures[0] instanceof TypeError);
			assert.doesNotMatch(failures[0].message, /sensitive raw text/u);
		});
	}
});
