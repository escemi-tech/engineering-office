# Normalize draft typography locally

The [writing normalizer](../../features/writing/normalizer) uses
[polytypo](https://polytypo.dev/docs/) to normalize English and French typography
in plain text, Markdown and HTML. Processing stays in the Node.js process without
network requests, logging or publication. It does not rewrite sentences, check
facts or make text sound natural; use the [writing policy](writing-policy.md)
and review the draft for those requirements.

## Prepare a draft

Provide `format`, `locale` and ordered `parts`. Each part contains a `kind` and
well-formed Unicode `text`:

- `prose`: newly authored content eligible for typography normalization.
- `verbatim`: quotations, source excerpts, signatures, cryptographic material
  and any code, commands, URLs, paths or identifiers outside protected syntax.
  These parts remain byte-for-byte intact.

Preserve provenance while constructing the draft. The module cannot identify
source material from its wording. A Markdown blockquote or HTML `blockquote`
does not prove provenance and must be classified as verbatim when it contains
evidence. If provenance is uncertain, retain that content verbatim.

Supply complete format fragments, including separators. Do not split inside
Markdown constructs or HTML elements; each prose part is parsed independently.
The module does not insert separators or reconstruct a document tree.

Use the runtime in the package's [.node-version](../../features/writing/normalizer/.node-version).
From the repository root, install the locked dependency with
`npm ci --ignore-scripts --prefix features/writing/normalizer`, then run:

```sh
node --input-type=module <<'JS'
import { WritingNormalizer } from './features/writing/normalizer/src/writing-normalizer.js';

const result = new WritingNormalizer().normalize({
  format: 'text/markdown',
  locale: 'en-GB',
  parts: [
    { kind: 'prose', text: "We  can't confirm... Check `release--id`.\n\n" },
    { kind: 'verbatim', text: '> Exact  source...\n' },
  ],
});
console.log(result.text); // Synthetic example only; do not log confidential drafts.
JS
```

The prose becomes "We can’t confirm… Check" followed by unchanged inline code.
The quotation and empty line remain unchanged.

## Supported profiles

Use an explicit locale: `en-US`, `en-GB`, `fr` or `fr-CA`. The French profiles
have different punctuation-spacing conventions; select the recipient's locale.
The ambiguous value `en` is unsupported.

| Format          | Parser behavior                                                 |
| --------------- | --------------------------------------------------------------- |
| `text/plain`    | Typography on classified prose; no automatic evidence detection |
| `text/markdown` | CommonMark with library GFM/frontmatter support; no MDX         |
| `text/html`     | Typography in text nodes without serializing the document again |

Markdown code, link destinations/titles, frontmatter and hard breaks remain
unchanged in the qualification corpus. HTML tags, attributes, entities, comments
and protected elements such as `code`, `pre`, `script` and `style` remain intact.
Visible link text is prose and may change. Do not treat this as an HTML sanitizer
or a guarantee for arbitrary Markdown extensions.

The profile enables the library's spacing, ellipsis, apostrophe, nonbreaking-space
and locale hyphenation defaults. For example, repeated ordinary spaces collapse,
`can't` becomes `can’t`, and `...` becomes `…`. French punctuation receives the
locale's appropriate spacing, including U+00A0 and U+202F where applicable.

Quote conversion, dash conversion, symbol substitution and numeric-range
conversion are disabled. Straight double quotes, technical operators and ranges
stay intact. Existing em dashes and hidden Unicode characters are not removed.
Avoid em dashes during generation; do not assume this module enforces every
writing preference. Accents, emoji joiners and decomposed Unicode are preserved
in the corpus. There is no blanket ASCII conversion or invisible-character scrub.

## Read the result

The input is not mutated. The result contains `format`, `locale`, normalized
`parts`, concatenated `text`, `coverage`, `warnings`, `changes`, `normalizerVersion`,
`engine` and `engineVersion`.

`changes` counts native library diagnostics, which can overlap; it is not a
character count or a replayable patch. Diagnostic text is not exposed or logged.
A second pass over the qualified corpus changes nothing.

Unknown formats or locales pass through unchanged with `coverage: "unsupported"`
and `unsupported-format` or `unsupported-locale`. Supported drafts report
`coverage: "normalized"` for this typography profile only. This does not certify
provenance, writing quality, facts or publication readiness. Invalid or
unclassified inputs throw a `TypeError` without echoing the draft. Processing
errors propagate to the caller; they must not be treated as successful coverage.

## Publication boundary

No client, Hermes runtime or outbound publisher calls this module automatically.
A managed publisher must retain raw evidence separately, reject unsupported
coverage when normalization is mandatory and preview the exact final payload
before approval. Any later payload change invalidates that approval. Record the
selected policy revision, normalizer and engine versions, and change count
without logging confidential text. Publication integration remains unimplemented.

See [validation](validation.md#writing-normalizer) for the upgrade checks and
[ADR 0004](../development/adr/0004-local-writing-normalization.md) for the library
qualification and maintenance trade-offs.
