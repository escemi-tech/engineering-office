# ADR 0008: Native WireGuard for private host administration

- Status: Proposed
- Date: 2026-11-12

## Context

M2.2 requires private SSH, an explicit operator identity, denied lateral flows
and independent revocation before a professional host can be activated. The owner
has no existing private-access service and asked us to select a maintained tool.
The OVH security-group quota issue still prevents provider qualification; a
complete administration boundary can be tested independently without spending.

## Decision

Compose native WireGuard and the maintained
[githubixx Ansible role](https://github.com/githubixx/ansible-role-wireguard), with
small Ansible tasks for the project's admission and nftables policy. WireGuard
owns cryptography and identity, the role owns generated keys and interface
convergence, and systemd owns persistence. No custom tunnel service, credential
issuer or networking framework is introduced.

At selection, the role's current stable release explicitly supports Ubuntu 26.04,
includes Molecule tests, has about 700 GitHub stars and uses GPL-3.0-or-later.
It is installed as an external Ansible dependency, with its license retained.
Exact versions live in maintained requirements, not this record. WireGuard's
[official operating model](https://www.wireguard.com/quickstart/) covers our
single-operator, single-public-host topology. Renovate owns Galaxy versions;
Dependabot owns Python dependencies and fixture image digests.

A managed mesh such as Tailscale would simplify identity-provider integration,
NAT traversal and multiple devices. Those needs are absent for this first public
host; it would introduce an account and control-plane dependency now. Headscale
would additionally create a service to operate. Revisit that trade-off when a
concrete multi-device or client-boundary requirement arrives.

The operator supplies explicit private host routes and a public key. Keep SSH's
own host/user authentication. Stage the interface, prove the actual private SSH
path, then enforce a dedicated atomic nftables table. Systemd requires the policy
before either SSH activation unit can start. Established bootstrap sessions are
preserved until the operator closes them; new public SSH is rejected for IPv4 and
IPv6. No packet forwarding through the management interface is permitted. General
application egress and cloud security groups remain separate responsibilities.

The upstream role uses native `wg syncconf`; route changes are not safely applied
that way. Reject changed address assignments on reruns rather than silently leave
live and persisted routing inconsistent. Peer-key rotation is an explicit console
operation. Do not build a generic migration mechanism for this single-host scope.

## Validation and consequences

The native Molecule action runs on a disposable GitHub-hosted runner using the
maintained [Ubuntu/systemd fixture](https://github.com/geerlingguy/docker-ubuntu2604-ansible).
Its distro-specific image family publishes `latest`; pinning its digest provides
reviewable updates through Dependabot. Fixture privilege is needed for systemd and
real network namespaces and is confined to that runner. No Docker socket or
operator directory is mounted inside the fixture. Local privileged testing is
not part of the workflow.

Acceptance covers unsafe-input refusal, unmanaged-file preservation, convergence,
real private SSH, wrong-key denial, public SSH denial, a previously reachable
lateral path becoming denied, identity preservation across systemd/container
restart, revocation and console recovery. Container restart exercises service
startup with retained configuration; it does not prove a VM kernel boot or OVH
routing. Those checks remain mandatory on the approved host before activation.

The independent console is a required recovery capability. WireGuard supplies
device identity, not user-level MFA or automatic device enrollment. There is one
operator peer. The assistant never receives management keys. Private access alone
does not qualify operational state, backups, provider quotas or spending.
