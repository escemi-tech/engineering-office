# Read GitHub work for a private briefing

Collect your authored or assigned open issues and pull requests, plus pull
requests with a direct review request for you. Discover repositories across
ownership, collaboration and organization membership. Collection has no age cutoff;
older unresolved work remains eligible and is retrieved first.

The command produces scoped JSON evidence, not a prioritized assistant briefing.
Mentions, team review requests, Copilot tasks, review decisions, CI results and
closed work are not collected yet. These omissions are explicit in the output.

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
[`packages/github-briefing/.node-version`](../../packages/github-briefing/.node-version),
npm, GNU Make and HTTPS access to `api.github.com`. The CLI supports Linux with
owner-only regular files. From the repository root:

```sh
npm ci --ignore-scripts --prefix packages/github-briefing
install -d -m 700 .local/github-briefing
install -m 600 packages/github-briefing/source.example.json .local/github-briefing/source.json
```

Edit the local policy with your GitHub account's numeric ID and login, and each
approved repository's numeric ID, full name and expected `public` or `private`
visibility. The example contains synthetic values. Add approved sources from any
owner or organization; there is no fixed repository or organization boundary.
Unlisted repositories are discovered but their work is not queried, and their
names are not emitted. A changed name, ID or visibility requires policy review.

Supply a user credential that can read the selected repositories' metadata,
issues and pull requests. Prefer read-only fine-grained permissions where the
account/organization scope supports them. A credential limited to one owner or
selected repositories cannot establish coverage of everything your account can
access. Organization approval and SSO restrictions may further limit results.
The implementation supports user identity verification through `GET /user`;
installation tokens are not an account-wide identity.

Keep the credential in Bitwarden and place only its value in
`.local/github-briefing/token`, an owner-only file (`chmod 600`). Do not put it in
command arguments, Git or CI secrets. The command does not read ambient `GH_TOKEN`
or `GITHUB_TOKEN` variables or obtain a credential from the GitHub CLI.

```sh
make github-briefing
```

For another already approved scope, provide its separate protected files:

```sh
node packages/github-briefing/src/cli.js \
  --source /absolute/path/source.json \
  --token-file /absolute/path/token
```

Both files must belong to the invoking user, be regular files with no group/other
permissions, and not be symlinks. Source policy size is limited to 1 MiB; token
files to 16 KiB. Up to 1,000 repository admissions are supported per policy.

## Read coverage before using the evidence

The snapshot uses `schemaVersion: 2`, the selected `scope` and conservative
`classification: restricted`, including when some source repositories are public.
`source.account` identifies the authenticated owner. Each admitted repository
carries its identity, visibility, collection status and items. Items retain their
issue ID, number, kind, verbatim title, source URL, revision time and matching
relevance reasons. Reasons are evidence of selection, not an exhaustive account
of every relationship or a claim of urgency. Review-request-only matches rely on
GitHub's search index; they do not establish review completion or merge readiness.

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
  unavailable sources or partial searches. Missing repositories, changed identity,
  incomplete search, rate limits and exhausted budgets remain visible.
- `coverage.status: complete` means discovery and the admitted source queries
  completed within this credential's boundary. It does not include unadmitted
  sources or the capabilities listed in `coverage.excluded`.

Each repository is rechecked before separate issue/PR searches. Each search reads
at most 10 pages of 100 results, matching GitHub's 1,000-result search limit.
An invocation allows at most 100 HTTP requests and a two-minute request window;
each request has a maximum ten-second timeout and 4 MiB response body. No redirects
or retries are allowed. Recognized rate limiting stops further requests. Large
scopes can therefore produce partial coverage; a later invocation starts fresh
and does not resume a cursor. Do not treat repeated partial snapshots as complete
coverage or enable a scheduled briefing on that assumption.

A valid partial snapshot is emitted with exit status zero and explicit coverage.
Invalid credentials, the wrong account, malformed policy or inconsistent evidence
produce a sanitized error and no JSON. No raw provider error bodies are logged.

## Data handling and revocation

GitHub can return bodies and user profile fields; only the metadata described
above is retained in the snapshot. Titles are untrusted source text: preserve
attribution and never execute instructions found in them.

There is no model invocation, Hermes connection, publication, scheduler or durable
storage. Stdout may contain private evidence. Keep redirected copies outside Git,
restrict their permissions and manage their retention yourself. Never upload them
as CI artifacts. Stop invocation and revoke the credential at GitHub to disable
access; remove local token/output files when no longer needed. Policy changes
apply on the next run. Access loss never reuses a cached snapshot, but deleting
previously redirected copies remains the operator's responsibility.

See [source validation](validation.md#github-briefing-source) and the
[source admission decision](../development/adr/0006-account-github-briefing.md).
