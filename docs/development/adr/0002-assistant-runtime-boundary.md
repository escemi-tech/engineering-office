# ADR 0002: Professional assistant runtime boundary

Date: 2026-11-04

Status: Proposed. Extends [ADR 0001](0001-domain-boundaries.md).

## Context

The owner selected professional internal work for the first assistant MVP.
The runtime should remain available during home outages without inheriting
coding-worker, household or client credentials. No cloud host is provisioned.

## Decision

Prepare one dedicated OVHcloud runtime and keep connector/publisher and deployment
identities outside it. Start with the upstream Hermes Docker image pinned by
version and digest, native persistent state, a loopback API and read-only policy.
Use synthetic inference to qualify startup, conversation, restart and restore.
Keep tools and private connectors disabled for this first slice.

Use the [permission policy](../assistant-security.md) before private activation.
An ordinary profile is not an isolation boundary. A professional VM on a personal
hypervisor also shares its administrator's authority; accept that risk explicitly
before choosing such a placement. Home Assistant remains local and independent;
Orca remains on the workstation until measurements justify another host.

The hosting ceiling is EUR 100/month excluding AI API costs; include tax until a
quote resolves its treatment. The separate initial test campaign is EUR 5 total
including tax, with three EUR 1 runs and EUR 2 for cleanup. Qualify the selected
service, region, quota and complete quote before provisioning. No purchase is
made or authorized by this decision.

## Consequences and qualification evidence

Use upstream container supervision, privilege dropping and state handling instead
of maintaining an installer. The supervisor starts as root; the gateway runs as
UID 10000. The container is not a substitute for the intended dedicated host,
restricted egress, machine-secret delivery or encrypted operational backups.

On 2026-11-04, the official `v0.22.7` image's install stamp identified upstream
revision `b200f5bc60e31588ba2cb60e288029c4a54ba5fa`. The deployment records its
multi-platform digest. The image's provenance file reports version `0.0.0`, so
use the release tag, digest and install-stamp revision together when reviewing it.
See the [upstream release](https://github.com/NousResearch/hermes-agent/releases/tag/v0.22.7),
[Docker setup](https://hermes-agent.nousresearch.com/docs/user-guide/docker) and
[managed configuration limits](https://hermes-agent.nousresearch.com/docs/user-guide/managed-scope).
The upstream agent source uses the
[MIT license](https://github.com/NousResearch/hermes-agent/blob/v0.22.7/LICENSE).
This evaluation uses synthetic data without a model provider; it does not approve
any inference processor, optional integration or private-data retention policy.

Private-source admission and operational isolation/recovery remain acceptance
gates. Review runtime qualification alongside each concrete dependency update;
a generic metadata schema is not required to deliver this initial deployment.

## Independent shutdown and gateway rotation: 2026-11-05

The Compose stop command requires successful configuration interpolation, including
credentials that an operator may have removed during an incident. Use native
Docker container operations for `make hermes-stop` instead. Select exact Compose
project and service labels, disable restart, stop with a bounded grace period and
verify the resulting state. Keep logs and volumes; do not implement shutdown by
destroying the deployment. The Make project variable defaults to the operational
project and also supports the reserved synthetic fixture project.

This reuses Docker's [restart policy update](https://docs.docker.com/reference/cli/docker/container/update/#update-a-containers-restart-policy---restart)
and [bounded stop](https://docs.docker.com/reference/cli/docker/container/stop/#stop-container-with-timeout--t---timeout)
instead of adding a control service or runtime endpoint. `unless-stopped` already
respects manual stops; explicitly setting `no` records the disabled policy and
also handles a changed restart policy. Normal startup recreates the service from
the reviewed Compose definition and restores its configured policy.

Gateway rotation uses the existing environment credential and recreation. It
does not need a new secret manager or authentication layer. Retain Bitwarden
custody and the protected local environment file pending scoped machine-secret
delivery. Stop/recreate is operator-controlled and interrupts service. Collect
incident evidence before recreation removes the old container's Docker logs.
Docker/host access, provider revocation, connector credentials and independent
deployment suspension remain separate operational controls.

Local qualification on 2026-11-05 passed eleven startup and six revocation Goss
assertions against the pinned Hermes image and synthetic inference. The fixture
pauses the gateway process, verifies an HTTP timeout, stops it from a directory
containing only the Makefile, and checks scope, retained logs/volume and repeated
shutdown. Recreation rejects the previous gateway key and reads the original
session with its replacement. Missing-container and unreachable-Docker cases
also pass. These checks do not exercise a host/daemon restart or provider-side
credential revocation; those remain operational qualification work.

## Scoped host deployment: 2026-11-05

Use native Ansible and `community.docker.docker_compose_v2` to deliver the existing
runtime to an explicitly approved Docker host. Build policy on the controller
and copy only the reviewed Compose/configuration files, compiled artifact and
shutdown Makefile. Preserve the named volume. Repeating unchanged assets must
preserve the container; changed mounted policy/configuration must recreate it.
This implements delivery without introducing another installer or secret service.

Keep human custody in Bitwarden. The operator supplies a protected inventory and
a separate four-setting runtime mapping. Reject unknown keys, malformed endpoint
URLs and missing credentials before changing the host. Deliver this mapping as a
root-owned, mode `0600` dotenv file under a mode `0700` directory; do not mount it
inside Hermes. Secret-bearing Ansible tasks use `no_log`, and template diffs are
disabled. Use native JSON string quoting with literal-dollar escaping for Compose.
Do not pass credential values in task environment variables: Ansible documents
that these can appear in cleartext process arguments. See the official
[environment guidance](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_environment.html),
[Compose module](https://docs.ansible.com/projects/ansible/latest/collections/community/docker/docker_compose_v2_module.html)
and [dotenv interpolation rules](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

The runtime receives only its gateway and inference credentials, model and endpoint.
The controller's SSH identity and Bitwarden session stay outside it. Host/Docker
administrators can still inspect the container environment; this is scoped delivery,
not protection from a compromised host. Operator approval remains manual, and no
workflow deploys to a real host. Cloud admission, restricted egress, unattended
vault access, connector identities and provider revocation remain open gates.

Ansible Core and `community.docker` are maintained GPL-3.0-or-later projects; use
their native modules rather than a custom SSH/Compose adapter. Dependencies and
controller Python are pinned in the Ansible manifests and updated by Dependabot
and Renovate. The test workflow reuses its disposable VM for missing/excess-credential
rejection, real entrypoint deployment and unchanged-state convergence. Goss owns
filesystem/runtime assertions, including special-character credential preservation
and exclusion of synthetic controller/operator credentials. These checks do not
qualify a real provider, private source or operational host.

## Encrypted native-state recovery: 2026-11-06

Use [Restic](https://github.com/restic/restic), licensed under
[BSD-2-Clause](https://github.com/restic/restic/blob/master/LICENSE), for encrypted
Hermes state snapshots. Install the Ubuntu-maintained package through the existing
host role. Distribution package maintenance owns updates, as for Docker; the
disposable Ubuntu image and integration scenario qualify the supplied CLI.
This avoids a custom encryption/archive implementation, another backup daemon,
or a separate container/binary update path.

Start with an explicitly initialized filesystem repository and a separate
root-only password file. Keep key custody and an offline recovery copy outside
the runtime. Native Restic owns encryption, repository locking, snapshot metadata
and integrity verification. Use its documented
[data checks](https://restic.readthedocs.io/en/stable/045_working_with_repos.html#checking-integrity-and-consistency)
and [subdirectory restore](https://restic.readthedocs.io/en/stable/050_restore.html).
Snapshot contents stay in the approved repository; CLI output is hidden in
Ansible, apart from the completed snapshot ID. No additional remote processor is
introduced by this local filesystem integration.

Require an exclusive operator maintenance window and a stopped gateway with
restart disabled. Keep it stopped after backup, including on failure. Restore
requires a full snapshot ID and an absent destination volume, and never starts
the runtime automatically. Deploy reviewed assets and credentials explicitly
after recovery and source-revocation review. Source-managed configuration and
recovery credentials are not part of the state snapshot.

Same-guest CI storage demonstrates encryption and recovery mechanics, not
independence from host loss. Storage placement, automatic scheduling, retention,
private key recovery and an operational drill remain activation gates. The
domain owner reviews those decisions before using private data.
