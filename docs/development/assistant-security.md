# Professional assistant permissions

The first MVP serves professional internal work. Its current runtime is qualified
with public synthetic fixtures only. Personal and client sources remain disabled.

The operator can separately collect relevant issue/PR and creator-scoped Copilot task/session metadata across repositories
with the [GitHub source command](../usage/github-briefing.md). Its
[admission contract](adr/0006-account-github-briefing.md) requires an explicit
account, one scope, approved repository identities/visibility and a protected
credential file. Discovery does not admit sources automatically. Account access
does not authorize private processing: record source approval before invocation.
Only the operator process reads the credential; neither it nor the source snapshot
is connected to Hermes. Runtime tools remain disabled.
Source admission must include task names and artifact identities before enabling
Agent Tasks reads. Copilot access loss removes task metadata; confirmed repository
access loss removes all of that repository's evidence. The command cannot execute
or modify agent tasks. See the source guide for excluded data and partial coverage.
PR context uses two fixed read-only GraphQL queries restricted to admitted
repositories. Admission includes bounded PR identity listing for artifact
resolution and review/check metadata for selected PRs. No global node lookup,
arbitrary query or mutation is accepted. Direct user mentions use separate
repository-scoped search queries, with no comment-thread collection or retained
response bodies. A mention is an indexed relationship, not authority to reply. GitHub's review decision and head-commit
check rollup are observations, not authorization to merge or approval of an action.

| Identity                   | Responsibility                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Human operator             | Select sources and processors, review final external actions, approve deployments and revoke access.                                 |
| Assistant runtime          | Produce conversations and drafts within its approved scope; no deployment or approval authority.                                     |
| Connector/publisher        | Hold source credentials outside the runtime and enforce allowed resources, methods and approved final payloads. Not implemented yet. |
| Deployer/recovery operator | Install reviewed artifacts, protect policy and independently stop or recover the service.                                            |
| CI/coding worker           | Use public code and synthetic fixtures; no private source or production credentials.                                                 |

The runtime receives only its inference credential and local gateway credential.
Tools are disabled in the mounted configuration. Credentials for mail, calendars,
publication, infrastructure and household services must never be added to this
runtime. Bitwarden remains the human custody store, with separate domain identities.

The [Ansible delivery path](../usage/hermes-deployment.md) accepts only the model,
endpoint and two runtime keys. It writes a root-only credential file, hides secret
task output and copies no controller vault session, SSH key or checkout into the
runtime. The host's Docker administrator can inspect service credentials; this
requires a trusted dedicated host and does not replace connector isolation.

The recovery operator can [stop Hermes and rotate credentials](../usage/hermes.md#stop-and-revoke-access)
without its API, compiler or deployment configuration. Shutdown disables Docker
restart and retains the container, logs and volume. It requires independent host
access and does not revoke provider credentials or prevent an authorized deployer
from starting the service again.

Before admitting a private source, record its owner, exact resources, allowed
operations, model processor/region, retention and revocation procedure. Verify
credential separation, egress restrictions and denied-scope access with that
connector. Before publication, bind approval to the final recipient and payload
and reconcile uncertain outcomes before retrying. These controls are still to be
implemented; a prompt or profile is not an authorization boundary.
