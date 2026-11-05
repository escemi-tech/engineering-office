# ADR 0004: Library-backed normalization of classified draft prose

- Status: Accepted for local qualification; outbound integration remains gated.
- Date: 2026-11-05
- Owner: escemi-tech maintainers
- Scope: WRT-002 and the concrete component review in FND-005.

## Context

Consistent writing needs both generation guidance and deterministic typography.
The latter must cover representative English/French messages, reviews and
briefings, preserve technical syntax and protect evidence. A few custom character
replacements do not define the broader requirement. No typography library can
infer provenance, verify facts or establish that a draft sounds natural.

The initial proposal implemented three plain-text replacements after rejecting
humanize-ai-lib. Review challenged that scope: evaluate maintained libraries
against representative content rather than require them to reproduce those three
rules. This decision replaces that unmerged implementation with a library profile.

## Candidate evidence

The following observations were collected on 2026-11-05 from upstream source,
published packages and disposable Node.js probes using synthetic text.

| Candidate                                                                                                        | Findings and decision                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [polytypo 1.19.0](https://github.com/polytypo/polytypo-js/tree/v1.19.0)                                          | Native locale profiles and text/Markdown/HTML processing with source-span edits. Selected after the corpus below passed.                                                                                                   |
| [Typograf 7.8.0](https://github.com/typograf/typograf/tree/v7.8.0)                                               | More established, MIT, no runtime dependencies and granular rules. Default processing consumed Markdown hard-break spaces; a separate Markdown integration would be needed for this scope. Remains a credible alternative. |
| [humanize-ai-lib 1.1.0](https://github.com/Nordth/humanize-ai-lib/tree/c55e6be5bd33520fcdc62824fe2999b70f78767f) | Default processing removed emoji joiners and Markdown hard breaks. Its dash-only mode changed `10–12` to `10-12`; broad rule groups do not supply the required format/locale handling.                                     |
| [unllm 2.1.0](https://www.npmjs.com/package/unllm/v/2.1.0)                                                       | A narrower character cleaner. The dash profile changed numeric ranges and mathematical minus signs; no native format parsing for the target scope.                                                                         |

These probes compare relevant capabilities, not a complete ranking or a claim
that every candidate configuration is unsafe. Parser packages alone would still
leave this repository maintaining the typography rules.

## Decision

Use polytypo behind a small `WritingNormalizer` adapter. The library owns all
typography transformations and parsing. The adapter owns classified input,
qualified locale/format selection, coverage and version metadata. There is no
custom substitution engine, document parser, plugin registry or model rewrite.

Qualify `en-US`, `en-GB`, `fr` and `fr-CA` for `text/plain`, `text/markdown`
(CommonMark with native GFM/frontmatter support) and `text/html`. Enable native
spacing, ellipsis, apostrophe, nonbreaking-space and locale hyphenation defaults.
Disable quote/dash conversion to preserve straight double quotes and avoid
introducing em dashes. Disable symbol and range substitutions to preserve
technical notation. Existing em dashes and hidden characters remain; this is
not a complete enforcement engine for the writing policy.

Process only explicitly classified prose. Pass verbatim parts through unchanged.
Callers must supply complete format fragments and retain trustworthy provenance;
syntax alone cannot identify source evidence. Unknown formats/locales remain
unchanged with explicit unsupported coverage. Reject malformed inputs.

The exact [npm dependency and lockfile](../../../packages/writing-normalizer/package.json)
pin `polytypo@1.19.0`, MIT, Node.js 20 or newer. The release tag resolves to
[`ea6ea017c6b6aa0ed238a567ba19bb5f58a81094`](https://github.com/polytypo/polytypo-js/tree/ea6ea017c6b6aa0ed238a567ba19bb5f58a81094).
The reviewed npm integrity is
`sha512-BvII8U2PUfM0nRwqeWh/eF7ZyoTQlHq7CIx2n69MqjwQYVPwb3m6jZaPiwFkxIafpm0P001OnwmoUOcltIwsTg==`.
Its five direct dependencies provide parse5 and micromark parsers/extensions;
the initial package lock resolves 59 external packages in total. This is a
larger dependency graph than a character cleaner, accepted to avoid maintaining
parsers and multilingual typography ourselves.

The upstream JavaScript repository was created in September 2026. Recent releases
show activity, but its limited adoption and short history are a maintenance risk,
not evidence of maturity. The reviewed issue list contained no demonstrated
blocker for this corpus. Reassess on a failing preservation test or unsupported
requirement; do not fork rules merely to retain this choice.

Dependabot owns grouped weekly npm updates and the native lockfile, with the
repository's seven-day cooldown. Renovate owns `.node-version`. The dedicated
Hoverkraft Node.js workflow runs the same corpus on dependency PRs. Review
changed output before accepting an update; an exact pin is not an upgrade policy
by itself.

## Qualification and consequences

The [suite and synthetic fixtures](../../../packages/writing-normalizer/tests)
pass 44 tests in Node.js 26.13.0 with container networking disabled:

- English email/review wording and French/Canadian French punctuation spacing.
- Apostrophes, ellipses, repeated spaces, currency, uncertainty and numeric values.
- Emoji joiners, accents, decomposed Unicode, minus signs and technical notation.
- Markdown fences, inline/indented code, links, frontmatter, tables, task lists,
  CRLF and hard breaks; spacing must not introduce escapes or new syntax.
- HTML attributes, entities, comments and protected elements without reserialization.
- Byte-preserved classified evidence in all formats, idempotence, nonmutation,
  malformed input rejection and explicit unsupported coverage.

Installation used npm with lifecycle scripts disabled and reported no known
vulnerabilities at qualification time. Runtime processing has no network or
model dependency, data destination, logging or publishing side effect. The
adapter reports library and adapter versions and counts native diagnostics
without exposing their before/after text. Counts can overlap and are not patches.

The corpus is an upgrade gate, not proof of exhaustive syntax coverage or semantic
equivalence. Natural phrasing, tone and relevance still need policy evaluation
against representative user-approved drafts. No client is automatically hooked
into this module. A future publisher must bind approval to the final normalized
payload, retain raw evidence and reject unsupported mandatory paths.
