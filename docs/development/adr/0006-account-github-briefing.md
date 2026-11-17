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

## Copilot metadata extension — 2026-11-11

Extend the accepted operator boundary with repository-scoped Agent Tasks list
and detail reads, using the same Octokit transport and Zod validation. Schema 3
adds separate task/session coverage and a final core repository access check.
This extends the operations in the admission table; the original schema 2
decision and its narrower qualification above remain historical evidence.

The [documented API](https://docs.github.com/en/rest/agent-tasks/agent-tasks)
and [official preview OpenAPI description](https://github.com/github/rest-api-description/blob/main/descriptions-next/api.github.com/api.github.com.json)
were inspected. Listing and detail support user access tokens with Agent Tasks
read permission, not installation tokens. The endpoints are public preview;
live account access remains unqualified. Listing can filter by creator and
archival status. The repository owner is not the task creator, and the preview
schema marks `user_collaborators` deprecated. Use the supported creator filter,
verify its numeric identity and explicitly exclude tasks created by other people.
Broader relevance needs a separately qualified supported contract.

Read non-archived tasks in all provider states without an age cutoff. Preserve
task and session identities, including distinct attempts and tasks without PRs.
Task artifacts contain resource IDs and optional GraphQL IDs, not PR numbers or
issue IDs. Retain these identities and branch refs without fabricating URLs or
joining unrelated identifier namespaces. PR resolution, relevance through a
linked PR and prioritized grouping remain subsequent work. Do not infer review,
CI or merge readiness from agent completion.

Keep optional provider metadata optional and report missing, stale or incomplete
session detail. Limit task pagination and reuse the global request/time/response
budgets. Ignore unknown response fields and never emit prompts, transcripts,
billing or raw errors. Task names remain untrusted, potentially sensitive evidence.
The adapter does not start, steer, retry, stop or archive tasks.

Agent Tasks permission failure does not by itself prove core repository access
was revoked. Discard task metadata after task access loss, then recheck core
repository identity/access; confirmed loss or changed admission discards all
evidence from that repository. Authentication loss discards the whole snapshot.
Unknown final access stays explicitly partial. No durable state or credentials
are added; synthetic SDK/CLI scenarios validate these boundaries without live
collection. Operator admission and account qualification remain required for
private use.

## PR context extension — 2026-11-11

Schema 4 adds one context record per selected PR and links its eligible Copilot
task IDs. Keep task/session states separate from GitHub's review decision and
head-commit check/status rollup. Null aggregate fields remain unknown; success
does not establish merge readiness. Closed/merged PRs are discovered through
an already selected task artifact; a selected open PR can also close before its
context is read. This extends source admission to PR identity
listing and review/check metadata, without activating a private source.

Use two fixed GraphQL queries through the existing Octokit requester. Both select
an explicitly admitted repository and verify its identity and visibility. The
transport accepts only those exact queries and validated variables; arbitrary
queries, mutations and global node lookups remain forbidden. The same request,
time, response-size and authentication boundaries apply to REST and GraphQL.
GraphQL errors discard that response's partial data and preserve a sanitized
coverage reason. Confirmed repository access loss still removes all its evidence.

The [PR schema](https://docs.github.com/en/graphql/reference/pulls#pullrequest)
provides `fullDatabaseId`, PR number, review decision and head commit. Use its
supported decimal-string ID, not deprecated `databaseId`, for PR identity.
The [commit schema](https://docs.github.com/en/graphql/reference/commits#statuscheckrollup)
provides GitHub's combined rollup without reimplementing check aggregation. An
authenticated query against public engineering-office #30 verified these fields
and string serialization; it did not qualify a private credential or Agent Tasks
access. Synthetic SDK tests exercise failures and source isolation.

Read context for relevant PR numbers first and match returned resource IDs.
Resolve remaining artifacts through at most ten pages of repository-scoped PR
identities, then read only matching PR context. An optional global node ID cannot
constrain lookup to the admitted repository before reading it, so it is not used
for lookup. Scanning bounded identities costs more requests but also works when
the task omits its global ID. It retrieves no unrelated PR titles or bodies.
Unresolved IDs remain explicit instead of guessing a URL or matching issue IDs.

GitHub's aggregate states avoid custom review/check reduction and its edge cases.
No check detail pagination or new dependency is needed. Unknown aggregate fields
and head changes remain visible; no merge action or readiness verdict is added.
Prioritization, delivery, account qualification and private activation remain
separate gates.

## Local presentation extension — 2026-11-11

The ordering and completed-work selection below are superseded by the
[current-work correction](#current-work-relevance-correction---2026-11-16).

Add deterministic text presentation over the existing schema 4 snapshot. The
operator's Make command shows five grouped work items; the CLI retains JSON as
its default and offers explicit text output. No collection contract, dependency,
source admission, external processor or storage changes.

Group only verified repository-local task/PR relationships, preserving all
attempts in JSON. Order explicit attention signals before running work, open or
unresolved work and completed/inactive work, then older updates within each
category. Display task, attempt, review and check states independently. An older
failed attempt must not hide a newer active one; a closed PR's historical failure
must not imply current action. Missing evidence and truncated presentation remain
visible. Source titles cannot emit terminal controls in text output.

A deterministic presentation is sufficient for this bounded operator slice and
avoids adding a model call or a ranking dependency before live qualification.
Its trade-off is fixed signal-based ordering rather than business prioritization.
Synthetic presentation and CLI tests qualify the local format; private source
activation, account API eligibility, assistant delivery and operational usefulness
remain unqualified.

## Direct mention extension — 2026-11-11

Schema 5 adds user mentions to open issue/PR selection within the existing
operator-approved repositories. Keep mention queries separate from the authored,
assigned and review-request OR query so a mention-only PR is never labelled as a
review request. Search coverage now names both work kind and selection. Merge
stable overlapping identities once, preserving observed relevance reasons, and
read PR context once. Changing revisions remain partial and cannot transfer an
older observation's relevance onto a different revision.

The [search qualifier documentation](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests#search-by-mention)
and [REST endpoint](https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests)
confirm the supported user-mention filter and separate issue/PR queries.
Authenticated queries with both forms against the public engineering-office
repository were accepted and returned empty complete results. This verifies
query acceptance, not positive live mention coverage or private account eligibility.
Synthetic SDK tests cover positive matches, overlaps, changes and failures.

The trade-off is two additional first-page search requests per repository, under
the unchanged global budget and GitHub's search-specific rate limit. Larger
scopes can therefore reach partial coverage sooner. Combining all qualifiers
would save requests but make review and mention attribution ambiguous; fetching
comment threads would add unnecessary source text and requests. Use GitHub's
index and existing SDK rather than introduce parsing or another dependency.

A mention can be old or already answered. Label it as search-derived relevance
without claiming urgency, a pending reply or permission to act. Team mentions and
team review requests remain excluded; this extension grants no new private-source
admission, assistant access, write operation or storage.

## Review request attribution (2026-11-11)

GitHub's documented `review-requested:<login>` qualifier includes requests to the
user and to teams they belong to. The earlier direct-only description and team
review exclusion in this ADR were incorrect. The combined authored/assigned/review
query also omitted review relevance when authorship or assignment already matched.
This decision supersedes those review-selection and coverage statements.

Schema 6 separates authored/assigned queries from one PR-only review query per
admitted repository. Keep `review-requested` relevance as the combined direct/team
relationship supported by the response, independent of other matching reasons.
Label it as a request to the account or a team in the briefing. Do not infer which
target matched, team identity, sole responsibility, approval or merge readiness.
The existing revision-aware overlap handling reads each selected PR context once.

This adds one first-page search per repository, for five before pagination, under
the unchanged global request and time budgets. Prefer the native qualifier over
team membership enumeration, per-team searches or additional credentials. Keep
review coverage independent, including rate limits and inaccessible sources;
a failed review search cannot create a review reason from authorship or assignment.
Team mentions remain outside coverage. No private source or runtime tool is enabled.

Synthetic SDK/presentation tests cover overlapping relationships, independent
pagination, partial search and access failures, and rejection of unrelated PRs
in authored/assigned results. They do not establish positive live team matching
for the owner's credential. The official contract is documented in
[GitHub review search](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests#search-by-pull-request-review-status-and-reviewer).

## Public operator qualification (2026-11-11)

The owner explicitly authorized a temporary copy of the existing GitHub CLI
credential for collection from public `escemi-tech/engineering-office` only.
The source policy admitted that repository to `professional-internal`; other
credential-visible repositories were discovered as metadata but their work was
not queried or their names emitted. This probe grants no private admission or
Hermes/model access and does not select the operational credential.

Collector commit `22ba1f95450b6d294eff968c78789020bdba22f7` produced a schema 6
snapshot at `2026-11-11T08:59:21.117Z`, before PR #34 merged. All 13 requests
completed within the existing limits. Discovery, five scoped searches, Agent
Tasks listing, selected PR context and the final access check were complete.
The authored PR match was #34, with the expected head commit, `OPEN` state,
`REVIEW_REQUIRED` review decision and `SUCCESS` head-commit checks. The local text
rendered those independent observations from the same snapshot without another
API call. PR #34 subsequently merged at `2026-11-11T08:59:23Z`; this is dated
observation evidence, not a statement of its current state.

Issue, mention and review searches and Copilot task listing returned no matches.
This establishes those reads were accepted for this credential and repository;
positive mention/review matching, task detail, session reads and live task/PR
grouping remain unqualified. One admitted repository's complete result does not
establish full-account coverage or business usefulness.

The temporary token file was deleted after collection, including a cleanup trap
for failure. Policy, snapshot and text files were verified as owner-owned mode
0600 within a private temporary directory. Raw output was kept local and excluded
from Git and CI artifacts. Use the maintained
[qualification procedure](../../usage/github-briefing.md#qualify-the-complete-local-journey) for later
credentials and approved scopes; this historical result is not their validation.

## Operational account refresh — 2026-11-11

The owner classified account-visible repositories as professional, except personal
repositories created for this ecosystem, and authorized local qualification using
the existing GitHub CLI credential. This does not approve a model processor,
Hermes ingestion, hosted activation or external writes. Temporary token copies
are deleted after each probe. Private records and source policies stay outside Git.

The previous sequential collector used five searches per repository and stopped
at a shared quota or request budget. A live baseline reached seven repositories
before rate limiting. Repeating it would revisit the same prefix. Synthetic
coverage of a small scope did not establish the intended account journey.

Schema 7 batches up to twenty explicit repository qualifiers per query and
separates repository admission, work search and enrichment. Individual identity
and issue/PR capability checks bracket collection: multi-repository search can
silently omit inaccessible resources. Fixed GraphQL count queries establish the
read boundary without collecting unrelated issue/PR content. Denied sources lose
all retained evidence; authentication loss still rejects the entire snapshot.

Bound refreshes to 2,000 requests and fifteen minutes, with at most 100 enrichment
requests per source and capacity reserved for later source checks. Keep existing
page, body and per-request timeout limits. Respect successful responses' quota-reset headers independently for search,
Copilot tasks, GraphQL and core REST reads, within the deadline. A failed request
is never retried. This small sequential wait uses native timers; a retry/queue
plugin, cache, cursor store and scheduler are unnecessary for this operating scope.
A future scope exceeding these bounds remains explicitly partial and must be
measured before changing this contract.

The explicit policy initialization command captures current identities and
visibility, requires complete discovery, validates exclusions, and creates a new
owner-only file without overwrite. Policy regeneration requires review; discovering
new sources during collection does not admit them. Setup, qualification and
revocation share the existing usage guide and feature PR. No new implementation
tracker or separate evidence PR is needed.

Live task qualification also identified a provider discrepancy: the response
used `/<owner>/<repo>/tasks/<id>`, while the documented example uses
`/<owner>/<repo>/copilot/tasks/<id>`. Accept both supplied forms only for the
exact admitted repository and task ID on `github.com`; never invent a link or
follow the response URL for API reads. A bounded rerun positively matched the
task and its session with complete coverage. The existing state/session test
covers both forms alongside foreign-link rejection.

The advanced-search live probe required an explicit parenthesized `OR` between
repository qualifiers; whitespace alone returned an empty intersection. A query
with twenty admitted repositories and known open work verified the supported
Boolean form. Copilot responses advertise their own `mission_control` quota
(60 reads per minute during qualification), independent of core/search/GraphQL.
Use reported reset times rather than assuming one shared REST quota or hardcoding
that preview-specific allowance. Synthetic cases cover separate task/search waits
and reject adjacent batch qualifiers without an explicit union.

A later live response supplied an attempt with completion before creation while
its task/repository identities matched. Rejecting the entire account snapshot
for that temporal defect prevented useful work from being shown. Omit that
attempt, retain verified task/work evidence and mark session/source coverage
partial with `inconsistent-session-time`. Do not repair or guess the timestamps.
Foreign identities and duplicate attempts still reject the snapshot. Three
synthetic ordering cases and an isolated live rerun verify the degraded result.

The full approved-source run completed at `2026-11-11T12:21:42.294Z` in
769 seconds using 1,181 requests. All 259 admissions received five complete work
search results and a successful final access check. Discovery was complete;
the personal household repository remained unadmitted. The snapshot contained
132 unique issue/PR work items, including 41 last updated more than a year ago.
Overlapping relevance counts were 76 authored, 64 assigned, 28 mentioned and
8 review-requested records. These counts are observations, not additive totals
or an exhaustive account of human access beyond the credential.

Copilot supplied 243 eligible tasks and 281 retained attempts. All 71 selected PR
contexts completed, including 21 linked to task artifacts; no artifact remained
unresolved. Repository coverage was complete for 256 sources and partial for
three: two attempts had contradictory timestamps and two had incomplete session
metadata. The snapshot and text both reported partial coverage. These upstream
omissions do not establish complete session history and must remain visible.
No source was starved by the request or time bounds in this run.

Protected setup reproduced the approved policy and excluded the personal source.
A subsequent reduced-policy run retained one public source and removed the other
258; it completed in 13 requests, made no work reads outside that policy and
emitted no removed source identities. Removing the temporary credential copy
made CLI invocation fail without stdout. This verifies local disable behavior;
provider-side credential revocation and mid-run access loss remain synthetic
checks, and the operational GitHub CLI credential was not revoked.

Private policy, JSON and text are retained in owner-only local files for owner
review, outside Git and CI artifacts. Temporary token copies were deleted.
The owner must still accept the briefing against known work. This qualification
approves neither a model processor nor hosted activation, and is dated evidence
rather than a promise that a future refresh will have identical coverage.

A bounded independent read of the eight matched PRs' requested reviewers confirmed
all eight as direct requests to the authenticated account. No team-only request
was present in this approved set. Team-review matching retains synthetic and
provider-contract coverage; its positive live qualification remains open until
an existing example is available. Do not create external work for this purpose.

## Operational review corrections — 2026-11-11

GitHub's current author filter includes PRs delegated to agents. Schema 8 records
`author-search` when an authored/assigned PR search matches without literal
authorship or current assignment. This supersedes the earlier rejection of such
PRs: indexed relevance cannot be reconstructed from those two response fields.
Keep the existing Octokit query and explicit search attribution rather than
adding a second collector or guessing an agent identity. Admission, URLs, record
identity and final access checks remain enforced; issue selection is unchanged.
The provider contract is documented in the
[GitHub changelog](https://github.blog/changelog/2026-07-09-new-pull-requests-dashboard-is-now-generally-available/).

The concise presentation counts every collected group by category and reserves
one of its five places for in-progress work. Native Node.js nonblocking file
opens reject named pipes before reading protected inputs. No dependency or new
persistent state is required. All 178 synthetic tests passed locally, including
delegated/unassigned PRs, identity mismatches, attention-heavy summaries and both
named-pipe inputs. These corrections have not been requalified with private live
data and do not replace the owner's pending acceptance.

## Current-work relevance correction - 2026-11-16

Owner review found a completed PR in the concise briefing because a linked
Copilot task retained a failed state. Oldest-first ordering also obscured recent
work. Select current evidence before grouping and order each priority category
by its latest source activity. Do not use completed or inactive history to fill
spare places. This supersedes the earlier presentation ordering and category totals.

Keep explicit current activity, incomplete sessions and unresolved PR references
eligible independently of a finished PR. Preserve complete JSON evidence and
the existing place reserved for running work. Reuse the collector and native
states; the small domain selection policy needs no new library or provider read.

The existing presentation suite reproduces the defect. All 186 synthetic tests
pass after correction, including current activity and uncertainty on finished
PRs. The owner accepts the corrected selection rendered from the same protected
snapshot. This validates presentation usefulness, not complete source coverage
or hosted connector activation; those acceptance gates remain separate.

## Native asynchronous Hermes integration - 2026-11-16

The owner chooses fresh collection with asynchronous progress. A qualified full
refresh required 1,185 GitHub requests, so a synchronous conversational HTTP
timeout is unsuitable. Keep the existing collector and its 15-minute budget;
reuse Hermes `/v1/runs` admission/status/stop and native session deletion instead
of adding a queue, worker scheduler or briefing cache.

Use the maintained [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v2.4.0)
for stateless Streamable HTTP transport, validation and HTTP host/origin guards.
Its stable server/node/express packages support the maintained Node runtime.
Its OAuth middleware requires expiring OAuth tokens, so the internal single-owner
service uses a separate constant-time checked API key rather than pretending a
static key is an OAuth grant. Native
[Hermes MCP configuration](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference/)
allows exactly one zero-argument read tool, with sampling, resources, prompts and
elicitation disabled. A general GitHub MCP server exposes a broader API and would
duplicate the qualified admission/selection rules; it is not the selected boundary.

The source container alone receives GitHub access. An internal Docker network
and the official Nginx image constrain Hermes egress to that tool and a fixed
inference endpoint. No executable skill or custom authorization framework is
needed. Source files are re-read after collection so changed admission cannot
silently return an obsolete result. Dependency automation covers SDK packages,
the connector Dockerfile and proxy/runtime Compose images.

A minimal Docker 29.9.3 probe reproduces that a container connected only to an
internal bridge has no published port, even when one is requested. Therefore the
same Nginx runtime proxy owns the loopback gateway binding and forwards it to
Hermes. Dynamic Docker DNS resolution avoids a startup dependency cycle. This
keeps Hermes without direct external egress and preserves the existing operator
interface. The hosted lifecycle checks the host path, authentication and binding
as well as container-to-container access.

Inspection of the pinned Hermes implementation shows that provider `store: false`
does not disable its local conversation database. The client creates identifiable
briefing sessions and deletes them through the native API after completion or
settled cancellation. An hourly systemd job removes abandoned feature sessions
older than one day. It preserves unrelated conversations. Native admission still
stores a final-response receipt when no idempotency key is sent. Native deletion
removes transcript copies but retains that receipt for seven days until a prune
pass runs. The cleanup unit calls the gateway owner's native `session.prune` RPC
through Hermes' own client, using an empty pre-epoch session window. This triggers
its expired-receipt reaper without selecting any application conversation. It
never opens or edits the database itself. The CLI cannot cover this case because
its preview returns before pruning when no session matches. This small adapter
is qualified against the pinned runtime in the hosted lifecycle.

The timer remains active after source disable, since disabling it would retain
receipts indefinitely. Seven days plus one hourly interval bounds normal receipt
retention after deletion; cleanup failures and downtime extend it. Native
in-memory run status and event buffers expire separately (about one hour and five
minutes). Runtime recreation clears only those buffers. Existing encrypted backups
can retain conversations and receipts for their 28-day recovery window. An
abandoned session plus receipt plus recovery window can approach 36 days from
collection, which must be reviewed before private activation. Processor retention
remains separate.
Runtime diagnostics use bounded ephemeral memory and no Docker stdout retention,
so source-derived logs do not become another persistent archive. The trade-off is
loss of those diagnostics on stop/restart. A stateless MCP client cancellation is
cooperative; the source's bounded call can finish before the native run stops.

Docker leaves the hidden log mountpoint root-owned when the temporary memory
mount disappears. The pinned Hermes bootstrap only repairs children when the
state root itself needs an ownership change, so source disable must restore the
log directory's runtime ownership before returning to persistent diagnostics.
A disposable-volume probe reproduces the native logging permission error and
passes after that correction. Native Ansible volume inspection and the file
module repair only this directory, without recursive ownership changes or
following a symlink. The existing disable lifecycle verifies the resulting runtime.

Synthetic coverage belongs in the existing Node suite and one dedicated hosted
deployment lifecycle, since protocol mocks cannot prove real tool registration,
network isolation or session deletion. These implementation checks do not authorize
live source processing. Source coverage, operational acceptance and owner approval
remain activation gates.

## Bounded recovery from provider throttling - 2026-11-17

Local credential replacement qualification exposes an operational failure: a
GitHub Search 403 reports a secondary limit with its search allowance exhausted.
The collector marks itself stopped before later Copilot and access reads. A fresh
invocation can hit the same limit, so replacing the credential does not solve the
transport defect. This extends the earlier stop-on-first-rate-limit decision.

Compose the [official Octokit throttling plugin](https://github.com/octokit/plugin-throttling.js)
with the existing REST client. Its maintained release supports the project's
Octokit Core and Node runtime. Use its search pacing, primary reset handling and
secondary retry delay instead of implementing another retry scheduler. Allow one
retry per refused request only when duration and request budgets permit. Keep the
fetch boundary authoritative for every actual attempt, credential revocation,
fixed read-only routes, response size and cancellation. An exhausted retry or an
unusable primary reset leaves partial coverage. A successful response consuming
the last task/search allowance still uses the existing per-family reset wait.

The plugin normally delays every GraphQL POST as a write. Both permitted queries
are fixed reads, and collection is sequential. Supply a serial Bottleneck write
group without that extra delay; retain the plugin's default search pacing. This
avoids adding hundreds of unnecessary seconds to account-wide reads within the
15-minute deadline. Bottleneck is already the plugin's scheduler and is declared
explicitly because the adapter configures its public Group API. Both exact npm
pins and their lockfile are covered by the existing grouped Dependabot updates.
No generic retry wrapper, new service or caller configuration is introduced.

Extend the existing HTTP-fixture suite for recovered primary and secondary
refusals, one-retry exhaustion and an excessive reset delay. The successful
recovery cases fail against the original adapter, demonstrating the coverage gap.
Reuse existing credential, request-budget and deadline tests. Synthetic tests use
the real SDK retry limiter and retry delays while replacing only throughput
queues with immediate execution. This avoids shared-clock contamination and
per-request timer overhead in large synthetic request-budget cases. No additional VM
scenario is needed for this HTTP boundary. Live qualification remains separate
from synthetic validation and does not approve a production credential change.
