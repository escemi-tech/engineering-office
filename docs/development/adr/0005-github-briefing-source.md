# ADR 0005: Bounded public GitHub evidence for professional briefings

- Status: Accepted for operator-run public collection; runtime integration remains gated.
- Date: 2026-11-07
- Owner: escemi-tech maintainers
- Scope: Initial source qualification for AI-004, KNO-001 and KNO-002.

## Context and alternatives

The owner selected GitHub repository work for the first professional briefing.
Cloud provisioning remains blocked by OVH quota qualification. The tested runtime
can progress toward useful evidence without private credentials or new services.

[GitHub's official MCP server](https://github.com/github/github-mcp-server/tree/v2.1.0)
is maintained and supports read-only mode and explicit tool selection. Its reviewed
[configuration](https://github.com/github/github-mcp-server/blob/v2.1.0/docs/server-configuration.md)
does not establish the selected-repository restriction required here. Interactive
tools also require a runtime transport and credential boundary. Defer that broader
integration until it meets a concrete need; do not build a replacement MCP server.

Direct hand-written HTTP/API parsing would duplicate supported SDK behavior.
Use [Octokit REST](https://octokit.github.io/rest.js/v22/) for GitHub requests and
[Zod](https://zod.dev/api) for response validation. Native fetch supplies deadlines,
redirect rejection and streamed response limits. The adapter owns only the source
restriction and minimal evidence contract.

## Decision and source admission

Use one operator command, `make github-briefing`, outside Hermes. Its reviewed
source manifest pins `escemi-tech/engineering-office` and repository ID
`1436734549`. Verify the ID, name, URL and public visibility before reading work.
Only anonymous GET requests to that repository and its issues endpoint are
allowed. No token, interactive tool, arbitrary URL or repository option is exposed.

| Admission field          | Decision                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Approving owner          | Project owner; selected GitHub repository work in this session                                         |
| Resource owner           | escemi-tech; public repository identified above                                                        |
| Scope and classification | Professional internal use of public evidence                                                           |
| Allowed operations       | Read repository identity and recently updated open issue/PR metadata                                   |
| Credentials              | None; ambient GitHub token variables are not used                                                      |
| Processor and region     | GitHub API and operator-local Node.js process; no model processor or new regional deployment           |
| Data retained            | IDs, kind, verbatim title, link, revision and collection coverage on stdout; bodies/profiles discarded |
| Retention and backups    | No application persistence or backup; redirected output is an operator-managed copy                    |
| Revocation               | Stop invocation; source changes require review; future reads reject a private or changed repository    |

The GitHub issues endpoint includes pull requests and exposes their issue IDs.
Read one page for the preceding seven days, sorted by update descending, requesting
21 records and emitting at most 20 with explicit truncation. Reject duplicate,
out-of-window, future, unsorted or malformed records. Keep revisions as API update
timestamps, not content hashes. Collection time is separate from source revision.
Schema version, professional scope, public classification and repository identity
are mandatory envelope fields inherited by every item. Preserve titles as untrusted
evidence; this module does not normalize, summarize or execute them.

Bound each of the two requests to ten seconds and 4 MiB of actual response bytes.
Do not paginate, redirect, retry or log raw responses/errors. Fail the whole read
with a sanitized diagnostic instead of emitting a partial or misleading empty
snapshot. This is an application boundary for the fixed command, not a sandbox
for arbitrary operator code or a runtime egress restriction.

## Component qualification

At qualification, the exact npm pins are `@octokit/rest@22.0.1` and `zod@4.6.7`,
both MIT. Octokit requires Node.js 20 or newer. The package uses the existing
repository's Node.js version, ESM JavaScript, npm lockfile and native test runner.
This small adapter needs no compilation, new workspace manager or test framework;
reuse the normalizer's established tooling rather than introduce the broader
application stack before it is needed.

The committed lockfile resolves 21 external packages. Installation with lifecycle
scripts disabled reported no known vulnerabilities on 2026-11-07. Dependabot owns
grouped weekly npm updates and lockfiles; Renovate's native `nodenv` manager owns
`.node-version`. The dedicated Hoverkraft Node.js workflow gates changes with
synthetic contract tests and JUnit/LCOV reporting.

Requests explicitly use GitHub REST API version `2026-03-10`, reviewed against the
[API version policy](https://docs.github.com/en/rest/about-the-rest-api/api-versions)
and [repository issues contract](https://docs.github.com/en/rest/issues/issues#list-repository-issues).
This protocol header is not a package version managed by Dependabot. Review it
against GitHub's deprecation notices during API dependency maintenance.

## Evidence and limits

On 2026-11-07, the operator command successfully collected one public item with
`truncated: false` from the selected repository using anonymous requests. Its
payload was kept outside Git. The synthetic suite exercises the real installed
SDK, source identity, scope, revisions, truncation, response bounds, failure
sanitization and the actual CLI. All 38 tests pass in the pinned Node container
with networking disabled. CI performs no live source collection.

This prepares source evidence; it does not complete the connector, persistence
or private-briefing milestones. A later consumer must make incomplete/unavailable
coverage visible and preserve source attribution. Prioritization, authenticated
interaction, source revocation of stored derivatives and durable reconciliation
remain required before enabling persistent/private ingestion. No background
worker, model invocation or external action is added by this decision.
