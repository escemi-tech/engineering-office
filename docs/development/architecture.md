# Infrastructure boundaries

Repository: `escemi-tech/engineering-office`. Scope: OVHcloud infrastructure, engineering agents and professional integrations.

This repository owns one independent trust domain. Future OpenTofu state must use
its own backend object namespace, access identity and encryption configuration.
No backend or deployment credential is configured during bootstrap. Local state,
plans, private variables, keys and private inventory are ignored by Git. Review
ignore rules before adding new state formats; an ignore rule is not secret scanning.

Human credentials and recovery keys stay in Bitwarden with identities dedicated
to this domain. Public defaults and synthetic CI fixtures may be committed.
Operational data, raw backups and authenticated test artifacts must remain outside
this public repository. PR CI uses no account credentials.

The `production` environment is reserved for reviewed deployments from protected
branches, with an explicit reviewer gate. No workflow currently deploys or spends
money. Main-branch rules require a pull-request review. Review each CI job's result
before merging.
A PR author cannot approve their own PR; another eligible reviewer is required.

Dependencies are pinned to immutable Action commits and a Docker digest. Dependabot
proposes updates. Pin all VM actions to the same shared revision. Workflows compose shared operations
and own cleanup conditions. The test action owns report parsing and publication. Review
shared CI updates with a complete VM lifecycle before merging.

The first assistant scope is professional internal. Its
[authority and source policy](assistant-security.md) separates runtime, connector,
review and deployment identities. The [placement ADR](adr/0002-assistant-runtime-boundary.md)
defines the proposed cloud boundary and shared-host limitations.
The [Hermes Compose deployment](../../services/hermes/compose.yml) runs the official
image pinned by release tag and digest, with native state in its own Docker volume.
Dependabot proposes image updates. The gateway binds to host loopback; its model
endpoint and credentials must be supplied explicitly. No cloud host or private
connector is configured. See the [runtime guide](../usage/hermes.md).

[Ansible delivery](../usage/hermes-deployment.md) converges this runtime on an
explicit SSH inventory. Policy compilation stays on the controller. The host
receives only reviewed runtime files, protected service credentials and the
independent shutdown Makefile. The playbook uses `community.docker` for lifecycle
management; cloud provisioning and production workflow activation remain separate.
