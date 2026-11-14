# Read GitHub work for a private briefing

Collect open issues and pull requests that you authored, delegated, are assigned to or are
mentioned in, plus pull requests with a review request for you or a team you belong
to. Discover repositories across ownership, collaboration and organization
membership. Collection has no age cutoff;
older unresolved work remains eligible and is retrieved first.
Also collect non-archived Copilot cloud-agent tasks created by your authenticated
account, with their session attempts and supplied PR/branch identities. Resolve
linked PRs and read GitHub's review decision and head-commit check rollup separately.

The command produces a concise local briefing or the complete scoped JSON evidence.
Team mentions, tasks created by other accounts, archived tasks,
local IDE/CLI agent activity and closed issues are not collected. Closed or merged
PRs are not independently searched; eligible Copilot artifacts can resolve to
them, and an open search result can close before its context is read. Merge
readiness is not evaluated. These omissions are explicit in the output.

## Approve sources and credentials

Run this command as the human operator, outside Hermes. Account access is not
permission to send private or client data to a model. Review the source owner,
resources, permitted local processing, retention and revocation before enabling
private collection. See [assistant permissions](../development/assistant-security.md).

Use a separate source policy and credential for each domain. Each policy names
one scope: `professional-internal`, `personal` or `client:<slug>`. Never assign
repositories from different client or personal contexts to one policy.
Repository membership in the policy is the operator's explicit admission decision;
the collector cannot independently infer business ownership.

Use the Node version in
[`features/briefing/github/.node-version`](../../features/briefing/github/.node-version),
npm, GNU Make and HTTPS access to `api.github.com`. The CLI supports Linux with
owner-only regular files. From the repository root:

```sh
npm ci --ignore-scripts --prefix features/briefing/github
install -d -m 700 .local/github-briefing
```

For a selected subset, copy `features/briefing/github/source.example.json` with
`install -m 600` to `.local/github-briefing/source.json` and replace its synthetic
values with the approved account and repository IDs, names and visibility.

If all credential-visible repositories belong to this context, the setup command
below discovers their identities for you. Exclude repositories belonging to other
contexts. This explicitly admits the current set; later collection never adds newly
discovered repositories. An identity, name or visibility change requires review.

Supply a user credential that can read the selected repositories' metadata,
issues and pull requests. Prefer read-only fine-grained permissions where the
account/organization scope supports them. A credential limited to one owner or
selected repositories cannot establish coverage of everything your account can
access. Organization approval and SSO restrictions may further limit results.
The implementation supports user identity verification through `GET /user`;
installation tokens are not an account-wide identity.

PR context also needs read access to the selected PRs' commits, checks and commit
statuses. Include those metadata reads and bounded PR identity listing in source
admission. [GraphQL permissions](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql#authenticating-with-graphql)
depend on the requested fields; qualify the selected credential before live use.
Missing permission is reported as unavailable context and does not replace the
existing issue/PR or task evidence with a fabricated result.

Copilot reads require the additional `Agent tasks: read` repository permission.
The [Agent Tasks API](https://docs.github.com/en/rest/agent-tasks/agent-tasks)
supports fine-grained personal access tokens and GitHub App user access tokens;
installation tokens are unsupported. It is in public preview. Before live use,
verify that the chosen account/token and organization policies allow these reads,
and include task names, session metadata and artifact identities in source
admission. Task names can contain sensitive text derived from prompts.
Synthetic tests do not establish your account's access or subscription eligibility.
Missing task access produces explicit unavailable coverage while accessible
issue/PR evidence remains usable.

Keep the credential in Bitwarden and place only its value in
`.local/github-briefing/token`, an owner-only file (`chmod 600`). An operator who
chooses to reuse their authenticated GitHub CLI credential can copy it with
`(umask 077; set -C; gh auth token > .local/github-briefing/token)`. This refuses
to replace an existing file. Its permissions may be broader than the collector's
fixed reads. The collector itself never reads ambient token variables, discovers
credentials or requests additional permissions.

To admit the account's current repository set into one context:

```sh
node features/briefing/github/src/adapters/cli.js \
  --init-policy --scope professional-internal \
  --exclude example-user/household \
  --source .local/github-briefing/source.json \
  --token-file .local/github-briefing/token
```

Replace the exclusion with an actual repository name; repeat `--exclude` as needed
or omit it when all sources belong to this context. Setup reads account/repository
metadata only, requires complete discovery and creates the policy with owner-only
permissions. It refuses to overwrite any existing file or symlink. Review the
result locally before collection. For a scope change, generate a separate policy,
review its additions/removals and replace the active file deliberately. Remove
revoked repositories immediately; there is no automatic admission refresh.

```sh
make github-briefing
```

For another already approved context, provide its separate protected files:

```sh
node features/briefing/github/src/adapters/cli.js \
  --source /absolute/path/source.json \
  --token-file /absolute/path/token --format text
```

Both inputs must belong to the invoking user, be regular files with no group/other
permissions, and not be symlinks. Source policy size is limited to 1 MiB; token
files to 16 KiB. Policies accept up to 1,000 admissions; the refresh budget can
leave large or busy sets partial. Check actual coverage before operational use.
Remove temporary token copies after qualification. Deleting the copy does not
revoke the credential stored by GitHub CLI or Bitwarden.

## Read the concise briefing

`make github-briefing` displays plain text: account and scope, observation time,
coverage warnings, totals by category and up to five grouped work items with source links. The
underlying CLI accepts `--format text` or `--format json`; JSON is its default
and includes all collected records and coverage detail. Both formats perform the
same bounded collection and retain the same protected input requirements.

Items are ordered by explicit signals:

1. **Needs attention:** waiting, failed or timed-out Copilot work; requested PR
   changes; failed/error CI; or a review request for you or one of your teams from
   search results.
2. **In progress:** queued or running tasks or their newest attempts.
3. **Open or unresolved work:** open issues/PRs and unavailable PR context.
4. **Completed or inactive:** completed, idle or cancelled tasks and closed/merged PRs.

When in-progress work exists, one of the five places is reserved for it, even
when attention items fill the briefing. The remaining places follow the priority
order above. Category totals count all collected groups, including those omitted
from the concise output; they do not imply complete source coverage.

Within each category, the oldest observed update in a group comes first, falling
back to a task's creation time when its update time is absent. That source
timestamp is shown separately from collection time; missing times are explicit.
Ties have a deterministic repository/record order. This ordering does not infer
business urgency, deadlines, approval or merge readiness. Review requests from
the search index are labelled as requests to you or a team. The response does not
identify which of those matched or name the team; it does not assign you sole
responsibility for a team request. Historical CI/review failures on a merged
or closed PR do not create an attention signal, while an active linked task
remains visible independently.

Verified PR/task relationships form one group within a repository. A task can
link several PRs, and several tasks can link one PR. Issues, unrelated tasks and
unresolved artifact IDs remain separate. Each group shows up to three records
of each kind and up to three latest attempts per task; omitted details are
counted and remain in JSON. Task and attempt states are shown separately. Only
the newest attempt's state affects ordering; equal-time newest attempts all
contribute. Older attempts remain in the evidence without overriding a newer
one. PR state, review and head-commit CI also remain separate, including unknowns.

Coverage warnings appear before the selected items, with up to five affected
repositories and a count of further affected sources. An empty partial result
never claims there is no outstanding work. Check observation time and source
coverage before acting; rerun collection to refresh it. Plain-text titles have
terminal controls removed, whitespace collapsed and a 280-character limit;
JSON retains the original titles. Titles are still untrusted evidence.

There is no model-generated synthesis, external delivery or saved briefing.
Choose JSON when five items or the abbreviated detail are insufficient:

```sh
node features/briefing/github/src/adapters/cli.js \
  --source .local/github-briefing/source.json \
  --token-file .local/github-briefing/token --format json
```

## Read coverage before using the evidence

The snapshot uses `schemaVersion: 8`, the selected `scope` and conservative
`classification: restricted`, including when some source repositories are public.
`source.account` identifies the authenticated owner. Each admitted repository
carries its identity, visibility, collection status and items. Items retain their
issue ID, number, kind, verbatim title, source URL, revision time and matching
relevance reasons. Reasons are evidence of selection, not an exhaustive account
of every relationship or a claim of urgency. Mention and review-request matches rely on GitHub's search index. A mention
establishes relevance, not an unanswered request, urgency or an obligation to reply;
it stays in the open/unresolved category unless a separate attention signal exists.
Review requests do not establish review completion or merge readiness.

GitHub's [author filter includes delegated agent PRs](https://github.blog/changelog/2026-07-09-new-pull-requests-dashboard-is-now-generally-available/).
When an authored/assigned PR search matches without literal authorship or current
assignment, `author-search` records that indexed relationship. Text labels it
"Authored or delegated (search result)"; it does not claim that you are the PR's
literal author or infer which agent created it. Repository admission, URL, record
identity and final access checks still apply. Issues require direct authorship or
assignment for this search; mention and review searches retain their own reasons.

`observedAt` records collection time, not the age of the underlying work. Search
indexing and changes during pagination can affect results. This is an independent
snapshot, not a transactional view or durable ingestion.

Check these fields before interpreting an empty list:

- `coverage.boundary` is `credential-visible-repositories`. Even complete discovery
  cannot prove that the credential sees everything the human account can access.
- `coverage.discovery` reports pagination or API failures. Discovery reads at most
  10 pages of 100 repositories, following page numbers rather than server-supplied URLs.
- `coverage.unadmittedRepositories` counts discovered sources outside this policy.
  Their identities and work are omitted; review admission separately when needed.
- `repositories[].status` and `searches[]` distinguish complete collection from
  unavailable sources or partial searches. Each entry identifies its `kind` and
  `selection`: `work` for authored/delegated/assigned work, `mentions` for direct user
  mentions, or `reviews` for review requests to you or your teams (PRs only).
  `matched` counts records retrieved for that repository/query. `batchTotal` is
  GitHub's total for the shared query across its batch; it is not a per-repository
  total. These counts overlap and must not be added to count unique work.
  Missing repositories, changed identity,
  incomplete search, rate limits and exhausted budgets remain visible.
- `repositories[].copilot` reports task coverage separately. Its boundary is
  `created-by-authenticated-user`; it never establishes coverage of tasks started
  by other people. The repository status is partial when task coverage is partial
  or unavailable, even if all issue/PR searches succeeded.
- `repositories[].access` records the final repository identity/access check.
  A failed verification makes coverage partial; confirmed access loss or changed
  identity/visibility removes all evidence collected for that repository.
- `repositories[].pullRequests` reports PR context and artifact resolution.
  Its `items[]` contains one record per PR number; `taskIds[]` links distinct tasks
  without merging their session histories. `unresolvedArtifacts[]` identifies
  resource IDs that could not be resolved and explains why. Context failures or
  unresolved artifacts make repository coverage partial.
- `coverage.status: complete` means discovery and the admitted source queries
  completed within this credential's boundary. It does not include unadmitted
  sources or the capabilities listed in `coverage.excluded`.

Repository identity and issue/PR read access are checked individually before
search and again before returning evidence. A fixed GraphQL query requests only
identity, visibility and issue/PR counts; unrelated titles or bodies are not
requested. This avoids treating a repository silently omitted from a multi-source
search as an empty backlog. Missing read permission makes the source unavailable.
Confirmed loss at the final check removes its work and task evidence.

Searches batch at most 20 explicitly admitted repositories. Each batch has five
independent queries: authored/assigned issues, mentioned issues, authored/assigned
PRs, mentioned PRs and review requests. Queries group repository names with explicit Boolean `OR`; no owner-wide wildcard
is used. Returned work must belong to that exact batch. Each
query reads at most ten pages of 100 results. Partial pagination applies to all
repositories in the batch. A rejected batch is checked individually to identify
inaccessible sources; inaccessible repositories are excluded from subsequent work
queries. No broader search is used as a fallback.

All admitted repositories are checked and searched before task/PR enrichment.
Enrichment allows at most 100 requests per repository and reserves a task-list
read and final access check for later repositories when the global budget permits.
A busy source reports `repository-budget` instead of consuming every remaining
request. This bound can leave some task details or PR context incomplete.

One invocation allows at most 2,000 HTTP requests and 15 minutes, with a ten-second
maximum request timeout and a 4 MiB response-body limit. After a successful read
exhausts its quota, the next read in that API family waits for GitHub's published
reset, provided it
fits within the invocation deadline. Missing/invalid reset information, an actual
rate-limit error or a reset beyond the deadline stops further requests. No failed
request is retried and no redirect is followed. The
[search-specific quota](https://docs.github.com/en/rest/search/search#rate-limit)
and the separate Copilot task quota are shared with other clients using the credential; concurrent usage can still
cause a partial run. A later invocation starts fresh; there is no stored cursor,
cache or stale-success fallback. Check the full admitted set's measured coverage
before scheduling or relying on a briefing.

The dedicated `mentions:<login>` query identifies mention matches independently
of review requests. It retrieves no comment threads or text-match fragments;
response bodies remain excluded from evidence. Stable overlaps become one item
with combined relevance reasons, and each selected PR's context is read once.
If title or revision time changes between searches, retain the newer observation
(the later response when times tie), keep only its relevance reasons and mark
coverage `changing-results`. Conflicting immutable identities reject the snapshot.
Results remain observations of a changing search index, not durable reconciliation.

The dedicated `review-requested:<login>` query uses GitHub's
[documented direct and team review matching](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests#search-by-pull-request-review-status-and-reviewer).
A matching PR receives `review-requested` relevance even when also authored,
assigned or mentioned. A failed review query does not invent a review request
from those other relationships. No team membership endpoint or extra credential
permission is added. GitHub's search index determines the team matches visible
to the credential; positive live coverage must be qualified before operational use.

Copilot listing reads at most ten pages of 100 non-archived tasks per admitted
repository, most recently updated first, with no date or task-state cutoff.
Each selected task needs one additional detail request for its sessions. Those
requests share the existing global request, time and response-size limits.
An extra page is checked when a full page has no continuation header; page numbers
and task paths are constructed locally. Response-provided URLs are never followed.

A valid partial snapshot is emitted with exit status zero and explicit coverage.
Invalid credentials, the wrong account, malformed policy or inconsistent evidence
produce a sanitized error and no briefing output. No raw provider error bodies are logged.

### Interpret Copilot tasks and attempts

`copilot.tasks[]` preserves the provider's task ID, state, creation/update times,
name and task link when supplied. Queued, running, waiting, failed, timed-out,
completed, idle and cancelled states remain distinct. A task can exist without a
PR. `sessions[]` preserves each attempt's own ID, state and timestamps; a previous
completed attempt cannot hide a later running one. `sessionCoverage` is complete
only when the detail response includes sessions matching its reported count.
Missing, stale or failed detail is explicit and does not invent session results.
An attempt whose timestamps contradict their ordering is omitted and reported as
`inconsistent-session-time`. Other verified attempts and work remain available;
this warning makes source coverage partial. Mismatched repository/task identities
still reject the snapshot.

`artifacts[]` preserves PR resource IDs and optional GraphQL IDs, or branch refs.
GitHub's PR resource ID is not the issue ID or PR number; do not turn it into a
`/pull/<number>` URL or join it to `items[].issueId`. Resolved links appear in
`pullRequests.items[]`, keyed by PR number and carrying their resource ID as a
decimal string. Separate tasks referencing the same PR remain separate records.
Optional fields omitted by GitHub remain absent
in the output; absent artifact metadata is not proof that no PR exists.

Agent completion does not mean tests passed, approval was granted or a PR is ready
to merge. For waiting or failed work,
inspect the supplied task link; raw error messages, prompts, transcripts, model
and billing details are excluded. A snapshot is an observation, not a live task
monitor. Check its `observedAt` before relying on task states.

### Interpret PR review and checks

`pullRequests.items[]` includes current PR state, draft flag, title, link, update
time and head commit. `reviewDecision` preserves GitHub's `APPROVED`,
`CHANGES_REQUESTED` or `REVIEW_REQUIRED`; `null` means GitHub did not report a
decision, not approval. `checks.state` preserves the head commit's combined check
and commit-status rollup: `ERROR`, `EXPECTED`, `FAILURE`, `PENDING` or `SUCCESS`.
A null state means no rollup was reported, not passing CI or proof of no checks.
`status: complete` means the query completed, not that all review/check states
are known or successful. A missing or mismatched last commit makes checks
unavailable, so a previous commit's success cannot describe the current head.

These are GitHub's aggregate observations, not an independent evaluation of
required checks, branch protection, merge queues or merge readiness. Task state,
review decision and checks can legitimately disagree. Raw reviews, check logs
and individual check details are not collected. A PR may have changed since its
search-index entry; the context record supplies the later observation.

PR context uses two fixed repository-scoped GraphQL queries through the same
Octokit transport. It first reads context for relevant PR numbers. For remaining
task artifacts it scans at most ten pages of 100 PR identities, including closed
and merged PRs, ordered by most recent update. Only matching identities are kept;
unrelated PR titles and bodies are not requested. It never follows opaque global
IDs to another repository or guesses PR numbers from resource IDs. Context needs
one query per selected PR; all requests share the global budget. Unresolved IDs,
pagination changes and inaccessible context stay explicit. GraphQL errors discard
that response's partial data; raw errors are not emitted. No mutation is allowed.

## Qualify the complete local journey

Identify existing authored/assigned work, a mention, a direct or team review
request and a Copilot task with sessions before the run. Do not create work merely
to populate this check. An empty successful endpoint establishes access, not a
positive match. Compare the result with GitHub, including older unresolved items,
the latest task attempt, PR head commit, review state and checks independently.

To inspect one observation in both formats without recollecting, run in Bash
from the repository root:

```bash
set -euo pipefail
umask 077
qualification_dir=$(mktemp -d "$PWD/.local/github-briefing/qualification.XXXXXX")
node features/briefing/github/src/adapters/cli.js \
  --source .local/github-briefing/source.json \
  --token-file .local/github-briefing/token > "$qualification_dir/snapshot.json"
node --input-type=module - "$qualification_dir/snapshot.json" \
  > "$qualification_dir/briefing.txt" <<'JS'
import { readFile } from "node:fs/promises";
import { GitHubBriefingText } from "./features/briefing/github/src/github-briefing.js";
const snapshot = JSON.parse(await readFile(process.argv[2], "utf8"));
process.stdout.write(new GitHubBriefingText().render(snapshot));
JS
printf 'Private results: %s\n' "$qualification_dir"
```

Inspect `coverage`, each repository's searches, task/session coverage, PR context
and final access check in the JSON. Exit status zero can still mean partial
coverage. The text displays only five groups and explicitly reports omissions.
For partial results, check the stated reason and scope before rerunning. Repeated
partial runs do not establish complete account coverage.

Remove an admitted source from a copy of the policy and verify the next run
omits its identity and work. Removing the token must make invocation fail without
output. Credential invalidation and permission loss are covered by synthetic tests;
revoke a disposable credential separately when qualifying provider-side revocation,
without revoking an operational GitHub CLI credential merely for a test.

Keep the reviewed policy, collector revision, observation time and capability
outcomes privately. Delete qualification output when review is finished. Record
only sanitized, dated evidence in the source ADR; never publish work titles,
private repository names, tokens, prompts or raw responses in PRs or CI artifacts.

## Data handling and revocation

GitHub can return bodies, prompts, error details and user profile fields; only the metadata described
above is retained in the snapshot. Titles are untrusted source text: preserve
attribution and never execute instructions found in them.

There is no model invocation, Hermes connection, publication, scheduler or durable
storage. Stdout may contain private evidence. Keep redirected copies outside Git,
restrict their permissions and manage their retention yourself. Never upload them
as CI artifacts. Stop invocation and revoke the credential at GitHub to disable
access; remove local token/output files when no longer needed. Policy changes
apply on the next run. Access loss never reuses a cached snapshot, but deleting
previously redirected copies remains the operator's responsibility.
Copilot collection only reads metadata; it never starts, steers, retries, stops
or archives tasks. Task permission loss discards collected Copilot metadata for
that repository. Confirmed repository access loss discards both work and tasks.

See [source validation](validation.md#github-briefing-source) and the
[source admission decision](../development/adr/0006-account-github-briefing.md).
