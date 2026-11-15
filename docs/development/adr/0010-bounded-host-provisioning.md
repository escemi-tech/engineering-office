# ADR 0010: Bounded native OVH host provisioning

Status: Accepted for the qualified provider lifecycle; retained-host and recovery
deployment approvals remain separate.

## Decision

Use the maintained OpenStack provider for one GRA11 b3-8 and the existing encrypted
OpenTofu backend. Keep Basic Public IP connectivity on Ext-Net with an instance disk,
a dedicated SSH keypair and an explicit security group. Reuse the existing Ansible
WireGuard and host deployment playbooks. The root execution plan owns delivery
acceptance; this ADR is not another tracker.

Use the maintained `openstack.cloud` collection for cleanup that does not depend
on provider state. Native systemd provides the independent deadline, writer stop,
persistence and bounded retry behavior. No custom API client, policy evaluator,
process scheduler or general cloud framework is introduced. The small Ansible
guards bind deletion to the approved project's exact run markers and public key.

The shared Hoverkraft modules previously reviewed do not cover this complete
single-host contract. Direct native provider resources avoid introducing a generic
module interface for one supported shape. The provider and collection releases
are pinned in their native manifests and owned by Renovate; Dependabot owns the
OpenStack SDK in the existing pip manifest. The native lockfile is committed.

Saved encrypted plans require an exact reviewed SHA256. An apply checks that its
current inputs match the saved plan.
Disposable runs require an independently armed timer with the same run data and
cannot extend the fixed deadline. A retained host uses separate approval and is
ineligible for qualification cleanup.

## Isolated replacement-host lifecycle on 2026-11-15

A restore exercise must preserve the primary host and independent backup until
the recovered session is accepted. The original fixed retained name and backend
key could not provide that simultaneous target. CLI workspaces alone separate
state but do not isolate resource names, credentials, deadlines or cleanup.

Reuse the same native OpenStack resources and Ansible role with an explicit
`recovery` UUID/expiry, mutually exclusive with `qualification`. Recovery gets
its own resource names, metadata, encrypted S3 key/lock and systemd writer/expiry
units. The `engineering-office-restore-<UUID>` resource name stays within 63
characters, preserving its complete UUID when Nova derives the guest hostname.
See the [native hostname limit](https://docs.openstack.org/nova/2026.1/user/launch-instance-from-image.html).
Native init selects the exact key; preflight refuses a checkout initialized
for another state. The controller selects the default native workspace explicitly.
No backend migration or reset of the provider campaign is introduced. The caller
must supply a qualified recovery identity that cannot modify primary state;
code does not create IAM users or claim that a filename proves permission scope.

The lifecycle reuses the existing fixed-deadline and ownership checks. Recovery
requires a separately approved EUR 0.60 exercise allowance and never consumes another
entry in the closed provider campaign. One recovery controller can operate at a
time; its units refuse takeover by another checkout. The retained host and its
normal commands keep their existing names and state key.

Native mocked plans cover distinct recovery resources and reject mixed lifecycle
or excessive cost inputs. Synthetic Ansible tests exercise primary/campaign
cleanup refusal, immutable reservations and wrong-backend refusal without changing
the original metadata. The existing hosted systemd fixture runs both namespaces
through repeated Make applies and timer interruption, verifying ledger preservation.
The extra hosted case is required for actual service-manager names and ordering;
no additional VM recovery scenario or third-party dependency is introduced.

Full live restore still requires its exact approved plan, real scoped credentials,
private access, independently recovered keys and measured recovery evidence. These
configuration tests do not authorize or qualify another paid VM.

## Trade-offs and boundaries

The only public ingress after bootstrap is WireGuard UDP 51820. Roaming peers
cannot use a fixed source CIDR; WireGuard authenticates them before private SSH
is reachable. IPv4 egress permits package repositories, S3 and inference endpoints
whose addresses change. These intentional rules have resource-local Trivy
exceptions for OPNSTK-0003 and OPNSTK-0004. They grant no public application access
and do not exempt the temporary operator-only SSH rule from scanning.

The controller must remain available. A persistent timer survives logout and
catches up after restart but cannot clean resources while the machine is offline.
OVH API outages also prevent a hard monetary guarantee. Three bounded native
cleanup attempts, an independent Console path, a cleanup reserve and refusal of
the next run make this limitation explicit rather than hiding orphaned resources.

The initial ledger permits three sequential VM runs at up to EUR 0.60 each,
preserving the EUR 1 storage allowance and EUR 2 cleanup reserve inside EUR 5.
No concurrent campaign controller is supported. The encrypted backend also
retains its native writer lock. A failed run keeps its reservation and fixed expiry.

Configuration tests use native OpenTofu mocks. Cleanup-guard tests use synthetic
provider responses before any deletion call. These cheap checks cover unsafe
configuration, incorrect ownership and partial creation; they do not prove live
API compatibility, address release, systemd execution, private SSH or interruption
recovery. The approved real campaign must prove those boundaries before acceptance.

## Read-only provider qualification on 2026-11-14

A dedicated user with Compute Operator and Network Security Operator authenticated
against GRA11. The owner confirmed separate Bitwarden custody. The selected public
Ubuntu image, b3-8 flavor and port-security-enabled Ext-Net are available. Native
OpenTofu produced an encrypted plan for exactly six creations: one server, one
keypair, one security group and three rules, with no updates or deletions.

Production Ansible discovery initially rejected a complete cloud dictionary
combined with a separate `api_timeout` module argument. The timeout now belongs
inside the complete connection configuration, as required by the native collection.
The real discovery and ownership checks then passed with zero changes and no
matching resources. No cloud resource was created by this plan or discovery;
provider writes, effective firewall enforcement and interrupted cleanup remain
unqualified. Private receipts, plan details and credentials remain outside Git.

## First disposable provider run on 2026-11-14

The owner approved one disposable run with a EUR 0.60 allocation, the stated price
basis and assumed 20% VAT. A renewed fixed deadline was separately confirmed after
the first proposal expired before execution. The independent timer was armed
before native apply, which created the six reviewed resources. Provider readback
matched the direct Ext-Net topology, dedicated group and three rules, with no
floating IP or attached volume. A subsequent native plan reported no drift.

Bootstrap SSH used a host key verified against the provider console. The owner
activated the WireGuard client and confirmed console login. Fresh private SSH
passed; the host firewall rejected fresh public SSH with a TCP reset. Guest facts
confirmed Ubuntu 26.04 and x86_64, booted in BIOS mode, not UEFI. Console entry was
difficult with the US keyboard layout. Native PAM accepted the original password;
a replacement with layout-independent lowercase letters allowed the owner to log
in. The management guide now explicitly prepares and verifies console access.

The provider cutover plan contained only deletion of the bootstrap SSH rule.
Its apply failed before execution: the armed cleanup service referenced the
completed transient writer, preventing systemd garbage collection and reuse of
its name. Move the ordering and conflict declarations onto the transient writer.
This preserves stop-before-cleanup behavior without a persistent reference from
the armed cleanup service. Native hosted tests exercise consecutive Make applies
with expiry armed and timer-driven interruption of a blocked synthetic writer;
they use no cloud credentials and never change the developer workstation.

The run was stopped after this failure. Independent production cleanup removed
the server, its port, group and keypair in about 46 seconds. Fresh provider reads
confirmed zero servers, ports and keypairs, with only the original default group
remaining. The timer was disabled and its unit files removed. State history,
buckets and recovery keys are retained. No invoice was retrieved; the run keeps
its campaign allocation and does not authorize a retry.

Provider-rule cutover, reboot, native destruction and interrupted/automatic-expiry
cloud scenarios remain unqualified. Passing the hosted regression test will not
close those live acceptance requirements. Keep this feature in draft until they
are completed under a separately approved run.

## Recreating removed controller units on 2026-11-15

The second approved run exposed a failure before provider creation. Its previous
run record remained, but the completed run's service and timer had been removed.
Calling `systemctl reset-failed` with the exact unloaded service name failed
before the next timer could be armed. Native daemon reload and same-run rearming
recovered the controller without changing the plan, deadline or campaign allocation.

Use systemctl's native pattern selection for this feature's qualification units.
Unloaded units have no counters to reset; loaded service/timer counters still
reset only for a new run after verified cleanup. Do not suppress command failures
or reset unrelated units. Extend the existing hosted controller scenario to call
the production expiry role with a completed prior reservation and absent units,
then verify the active timer and retained campaign allocations before writer tests.

## References

- [OpenStack provider](https://github.com/terraform-provider-openstack/terraform-provider-openstack)
- [Native OpenStack collection](https://docs.ansible.com/projects/ansible/latest/collections/openstack/cloud/)
- [OVH networking concepts](https://docs.ovhcloud.com/en/guides/public-cloud/network-services/concepts)
- [systemd timers](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html)
- [Unit garbage collection](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html#Unit%20Garbage%20Collection)
- [State and recovery decision](0007-recoverable-infrastructure-state.md)
- [Private administration decision](0008-private-administration.md)
