# Request a fresh GitHub briefing through Hermes

The optional briefing capability collects current work from explicitly admitted
professional repositories, then asks Hermes to summarize it. It uses native
asynchronous Hermes runs with progress, not a saved briefing. Collection can take
15 minutes; the client requests cancellation after 20 minutes. Coverage may be
partial because of source permissions, pagination or provider limits.

## Enable an approved scope

Start with the [source admission guide](github-briefing.md) and the
[host deployment guide](hermes-deployment.md). Qualify the actual credential and
review its coverage. Approve the source scope, model processor, conversation
retention below and production deployment before enabling this capability.
Repository access alone does not authorize sending work to a model.

In the protected `.local/hermes-deployment.yml`, retain `hermes_runtime` and add:

```yaml
hermes_briefing:
  source_policy:
    account: { id: 101, login: example-user }
    scope: professional-internal
    repositories:
      - { id: 201, fullName: example-org/project, visibility: private }
  github_token: REPLACE_WITH_APPROVED_SOURCE_CREDENTIAL
  connector_key: REPLACE_WITH_SEPARATE_RANDOM_KEY_OF_AT_LEAST_32_CHARACTERS
```

Replace the synthetic identities with the reviewed source policy. Keep the file
owner-only and store credentials separately in Bitwarden. The GitHub token,
connector key, gateway key and inference key must all differ. The connector reads
its protected files on every invocation and checks them again before returning
evidence. A changed policy or credential invalidates an in-flight result.

Use an HTTPS inference origin ending in `/v1`. The fixed Nginx upstream accepts
only `POST /v1/chat/completions`; a provider requiring other APIs needs a reviewed
implementation change. Loopback HTTP is supported only for isolated fixtures.

Run `make hermes-host` during approved host preparation to install Buildx and the
qualified Compose plugin. The briefing overlay requires Compose 2.24.4 or newer.
If automatic backups are installed, first wait for the current worker to finish,
then run `sudo make -C /srv/engineering-office hermes-backup-disable` on the host.
Keep the timer disabled during maintenance. After production approval, run
`make hermes-deploy` from the controller. Deployment builds the
connector from the locked package, starts it with a private read-only source
mount, restricts Hermes to an internal Docker network and enables hourly
conversation cleanup. The existing Nginx runtime proxy publishes the authenticated
gateway on host loopback and forwards inference to the fixed provider. Hermes
itself has no published port or external network. Only the one named MCP briefing tool is exposed. The
canonical writing policy and briefing instructions are mounted read-only.
No shell, browser, arbitrary HTTP, source selection or mutation tool is enabled.

Run `make hermes-health` to verify the deployed gateway. Before resuming automatic
backups, run `make hermes-backup-schedule` from the same controller checkout with
the approved schedule configuration. This installs the matching health tasks in
the independent backup worker and re-enables its timer. The worker checks the
actual gateway listener without needing the source policy or GitHub credential.
See the [automatic backup procedure](hermes-backup.md#enable-automatic-backups).

## Read a briefing

Connect to the host using the approved private SSH path and run:

```sh
sudo make --silent -C /srv/engineering-office hermes-briefing
```

The command authenticates to the host-local Hermes gateway, creates a dedicated
session, starts one native `/v1/runs` request and prints its status and elapsed
seconds to stderr. The final sourced response goes to stdout, with deterministic
scope and coverage information from the collected evidence. Progress is a run
state, not a percentage or an estimate of remaining requests.

The GitHub token is mounted only in the connector. Hermes receives the separate
MCP key and the selected evidence, never that token. Gateway authentication is
for a trusted single operator; it is not a multi-user authorization system. The
host administrator can inspect containers and credentials.

No automatic retry creates another model run. If the model fails, the source is
unavailable or fresh evidence is missing, the command fails without substituting
an old response. Partial evidence remains visibly partial. Ctrl-C requests native
run cancellation; an in-flight stateless MCP call can continue until its bounded
collection finishes. If cleanup cannot finish, the
command reports failure and the independent timer retries expired conversations.
After a gateway restart, request a new briefing instead of replaying an old run.

## Retention and revocation

Normal completion deletes the dedicated conversation through Hermes' native
session API before returning the answer. A failed or interrupted conversation is
also deleted once its writer settles. Abandoned `office-briefing-*` sessions are
deleted after 24 hours by an hourly timer, so their normal maximum age is about
25 hours. Failed cleanup, host downtime or an active writer can delay deletion;
inspect `hermes-briefing-cleanup-<project>.service` failures and retry after recovery.
Other conversations are preserved.

Native Hermes keeps a durable retry receipt containing the final response even
without an idempotency key. Deleting the conversation removes its transcript but
does not immediately delete that receipt. Hermes makes it eligible for pruning
seven days after deletion. The hourly cleanup also invokes Hermes' own receipt
reaper, so normal retention is seven days plus about one hour after deletion.
An abandoned conversation can therefore leave a final response for about eight
days and two hours from creation. Downtime or cleanup failures extend these bounds.
The native reaper also removes expired receipts for previously deleted unrelated
sessions; it does not delete unrelated conversations. Non-content deletion markers
remain to prevent deleted session IDs being reused.

Terminal run status/output also remains in memory for about one hour and event
buffers for about five minutes; restart clears those buffers, not the durable
receipts. Hermes diagnostics use a bounded
memory-only log mount, cleared on stop/restart, and Docker does not retain its
stdout. They are not included in state backups. Diagnostic logging therefore
cannot be inspected with `docker logs`; inspect `/opt/data/logs` inside the running
container when necessary, without copying private content into issues.
Deleting a session is logical
deletion, not secure erasure of disk blocks. A backup taken while a conversation or
receipt exists can retain it within the existing encrypted 28-day recovery window.
For the longest-lived abandoned receipt this can approach 36 days from collection.
A restore can
reintroduce it; run cleanup before serving restored data. Model-provider retention
is separate and follows the approved processing profile. Terminal output and any
operator-created copies are the operator's responsibility.

To disable the capability, set `hermes_briefing: {}` and deploy the approved
configuration. Deployment stops the source first, deletes briefing conversations,
removes its containers and source credential files, and clears runtime buffers
through recreation. The cleanup timer and its protected gateway credential remain
installed to expire durable receipts, including after a restore. If a live writer prevents deletion,
deployment stops with the source already disabled; wait for the bounded run to
settle and repeat. Existing non-briefing conversations and backups remain intact.

For immediate independent revocation, stop the owned source container and disable
its restart, then revoke the token at GitHub. With the default project name:

```sh
sudo docker update --restart=no engineering-office-hermes-briefing-source-1
sudo docker stop engineering-office-hermes-briefing-source-1
```

Follow with the disabling deployment to delete source-derived conversations and
remove local access material. For an urgent whole-runtime stop, use the
[independent shutdown procedure](hermes.md#stop-and-revoke-access). Removing a
local token file alone does not revoke the provider credential. Source content
already sent to the approved model cannot be recalled by this connector.

The connector keeps no snapshot, queue or result cache. It enforces one collection
at a time and retains the collector's fixed read-only GitHub routes and request
budgets. Network separation prevents direct outbound TCP access from Hermes;
it does not protect against a compromised host administrator or Docker daemon.
Prompt instructions reduce misuse, while the tool schema, source policy,
credential separation and network restrictions enforce the capability boundary.
