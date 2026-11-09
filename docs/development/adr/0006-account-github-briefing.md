# ADR 0006: Account-wide scoped GitHub evidence

- Status: Accepted for operator-run collection; private source activation requires admission.
- Date: 2026-11-09
- Owner: escemi-tech maintainers
- Supersedes: [ADR 0005](0005-github-briefing-source.md), preserving its qualification evidence.

## Context

The intended briefing covers the owner's work across accessible repositories,
including other organizations and private work. One public repository and a
seven-day window cannot represent that need. Hosting remains independent of this
operator-local development slice.

## Decision

Keep Octokit, Zod and the existing package/CI tooling. Replace the fixed anonymous
source with an explicit authenticated user and local admission policy. Verify the
numeric user ID and login, discover credential-visible repositories through
`GET /user/repos`, and recheck approved repository identity and visibility before
querying work. Policies select one professional, personal or client context and
explicit repository identities. Credentials are separate per domain and never
passed to Hermes. Source access alone does not approve private processing.

| Admission field | Contract                                                                               |
| --------------- | -------------------------------------------------------------------------------------- |
| Approving owner | Human operator records source admission before invoking collection                     |
| Resources       | Numeric account/repository IDs, names and visibility in a protected local policy       |
| Operations      | Read user identity, repository metadata and relevant open issue/PR search results      |
| Processor       | GitHub and operator-local Node process; no model or new hosted service                 |
| Credentials     | Explicit owner-only token file; no ambient token or GitHub CLI credential discovery    |
| Classification  | Entire output is restricted and belongs to the policy's single scope                   |
| Retention       | Memory/stdout only; redirected files remain operator-managed                           |
| Revocation      | Stop invocation, revoke credential, update policy and delete retained output as needed |

Use separate issue and PR queries with explicit repository restrictions. Select
authorship, assignment and direct review requests with Boolean OR queries;
keep older unresolved work eligible. Index-based selection is not authoritative
review/CI status. Mentions, team requests and Copilot sessions are explicitly
uncollected; the latter needs its own Agent tasks API qualification.

The [repository API](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)
describes explicit ownership/collaboration/organization access. A complete response
only establishes what this credential can discover, not the full human account's
permissions. The [search API](https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests)
requires separate issue/PR queries for GitHub App user tokens, supports advanced
search, limits each search to 1,000 results and can return incomplete results.

Bound discovery, search pagination, total requests, duration and response bytes.
Report partial results per source/query. Stop additional requests when rate limits
are identified; fail the entire snapshot on authentication loss or malformed
identity/evidence. Do not follow response-supplied URLs or log raw API errors.
Version the changed evidence envelope as schema 2.

## Alternatives and consequences

Automatic admission of every accessible repository would conflate access with
permission to process and mix contexts. Global search followed by local filtering
would retrieve work from unapproved sources. Explicit repository-scoped searches
avoid that, at the cost of policy maintenance and additional API calls.

Per-owner admission rules and a resumable scheduler would add new authorization
and persistence behavior. Defer them until actual usage establishes that need.
The bounded operator command can return partial coverage on large accounts; it
must not be represented as an already complete or scheduled private briefing.

This is an application boundary for a fixed operator command, not a sandbox for
arbitrary code. Runtime egress enforcement, authenticated assistant interaction,
durable reconciliation and deletion propagation remain separate gates. Synthetic
SDK/CLI tests cover this contract; no private credentials or live account contents
are required by CI or activated by this change.
