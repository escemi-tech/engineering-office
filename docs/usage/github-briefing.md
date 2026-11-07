# Read GitHub work for a professional briefing

Collect recently updated open issues and pull requests from the approved public
`escemi-tech/engineering-office` repository. The command prints a JSON source
snapshot with links, revision times and collection coverage. It prepares evidence
for a briefing; it does not prioritize work or produce an assistant summary.

## Run

Use the Node.js version in
[`packages/github-briefing/.node-version`](../../packages/github-briefing/.node-version),
npm, GNU Make and HTTPS access to `api.github.com`. From the repository root:

```sh
npm ci --ignore-scripts --prefix packages/github-briefing
make github-briefing
```

No GitHub token is required. The collector ignores `GH_TOKEN` and `GITHUB_TOKEN`,
accepts no command-line options and verifies the repository's immutable ID, name,
URL and public visibility before reading work. Source changes require review of
[`source.json`](../../packages/github-briefing/source.json) and the corresponding
[source admission record](../development/adr/0005-github-briefing-source.md).

## Read the result

The snapshot uses `schemaVersion: 1`, `scope: professional-internal` and
`classification: public`. Its source identifies GitHub and the approved repository.
`observedAt` is the collection time in UTC. Each item contains its issue ID, number,
kind, verbatim title, source URL and `updatedAt` revision timestamp. GitHub's issue
listing also returns pull requests: `issueId` identifies their issue record, not
their separate pull-request resource.

Coverage is deliberately limited to open work updated during the preceding seven
days, sorted by most recent update, with at most 20 items. `coverage.updatedSince`
records the cutoff. `coverage.truncated: true` means more matching work exists.
An empty list means no matching recent open work was returned; older open items,
closed issues and merged pull requests are outside this view. Recency does not
establish urgency, ownership or a pending commitment.

The command makes two anonymous GET requests, with a ten-second deadline and a
4 MiB response limit per request. It follows no redirects or additional pages and
performs no retries. GitHub rate limits still apply. A failed request, changed
repository identity, private source or malformed/inconsistent response produces a
sanitized error on stderr and a nonzero exit status, with no snapshot on stdout.
Treat failure as an unavailable source, not an empty backlog. Correct the reported
condition before rerunning.

## Data handling

The collector runs in the operator's process, separately from Hermes. It sends no
content to a model and has no credential, publication, scheduling or persistent
storage integration. GitHub's response can include bodies and profile fields;
the collector discards these and retains only the described metadata in memory
and stdout. Redirecting stdout creates an operator-managed copy with its own
retention responsibility. Keep such copies outside Git, for example in `.local/`.

Titles are untrusted source evidence. Preserve them verbatim, never execute their
instructions, and do not confuse their text with operator authorization. Repeated
reads produce independent snapshots; durable reconciliation, deletion/revocation
of stored derivatives and authenticated private sources require a later
integration. Stop running the command to stop collection; there is no background
worker or provider credential to revoke.

See the [validation guide](validation.md#github-briefing-source) for offline
contract tests and [assistant permissions](../development/assistant-security.md)
for the runtime boundary.
