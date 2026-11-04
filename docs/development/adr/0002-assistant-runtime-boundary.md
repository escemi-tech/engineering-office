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
