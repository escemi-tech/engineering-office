import { analyze, transform } from "polytypo";
import engine from "polytypo/package.json" with { type: "json" };
import manifest from "../package.json" with { type: "json" };

const modes = new Map([
	["text/plain", "text"],
	["text/markdown", "markdown"],
	["text/html", "html"],
]);
const locales = new Set(["en-US", "en-GB", "fr", "fr-CA"]);
// Keep straight quotes and avoid introducing dashes or rewriting technical notation.
const rules = { quotes: false, dashes: false, symbols: false, ranges: false };

/** Normalize only prose explicitly separated from evidence by the caller. */
export class WritingNormalizer {
	normalize(draft) {
		if (
			!draft ||
			typeof draft.format !== "string" ||
			!draft.format ||
			typeof draft.locale !== "string" ||
			!draft.locale ||
			!Array.isArray(draft.parts)
		) {
			throw new TypeError(
				"A draft requires format, locale and classified parts.",
			);
		}

		for (const part of draft.parts) {
			if (
				!part ||
				!["prose", "verbatim"].includes(part.kind) ||
				typeof part.text !== "string" ||
				!part.text.isWellFormed()
			) {
				throw new TypeError(
					"Each part requires a prose/verbatim kind and well-formed text.",
				);
			}
		}

		const warnings = [];
		const mode = modes.get(draft.format);
		if (!mode) warnings.push("unsupported-format");
		if (!locales.has(draft.locale)) warnings.push("unsupported-locale");
		const options = {
			locale: draft.locale,
			mode,
			...(mode === "markdown" ? { dialect: "commonmark" } : {}),
			rules,
		};
		let changes = 0;
		const parts = draft.parts.map(({ kind, text }) => {
			if (warnings.length || kind === "verbatim") return { kind, text };

			// Native diagnostics can overlap; count them without replaying or exposing text.
			changes += analyze(text, options).length;
			return { kind, text: transform(text, options) };
		});

		return {
			format: draft.format,
			locale: draft.locale,
			parts,
			text: parts.map((part) => part.text).join(""),
			coverage: warnings.length ? "unsupported" : "normalized",
			warnings,
			changes,
			normalizerVersion: manifest.version,
			engine: engine.name,
			engineVersion: engine.version,
		};
	}
}
