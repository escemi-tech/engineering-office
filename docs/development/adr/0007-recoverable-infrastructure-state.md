# ADR 0007: Independently recoverable infrastructure state

**Date:** 2026-11-12

**Status:** Implementation; operational endpoint qualification pending

## Context and decision

Cloud resources require recoverable state before the first allocation. A state
bucket created by the same uninitialized remote-state stack creates a bootstrap
cycle. Use the maintained `amazon.aws.s3_bucket` Ansible module for this narrow
bootstrap, and native OpenTofu for subsequent infrastructure state and resource
management. This is an exception limited to the remote backend's initial storage;
Ansible does not become the cloud-host provisioning engine.

The bucket is dedicated to the professional host, private, versioned, and tagged
with ownership. Existing unowned buckets are refused. The bootstrap has no delete
operation or independent state database to recover. Credentials and a distinct
encryption password remain in human custody with separately recoverable copies.
OpenTofu's native PBKDF2/AES-GCM encryption applies to state and plans, without a
plaintext fallback, and native S3 conditional writes provide locking.

The state workspace and bootstrap are an independently reviewable recovery
boundary. Their test uses a native `terraform_data` resource only in the isolated
fixture; it is not a cloud resource or a replacement for live provider testing.
Actual compute provisioning, network policy and paid cleanup remain a subsequent
complete feature, gated by the unresolved OVH quota and quote.

## Alternatives and consequences

Reuse the native S3 backend instead of adding a lock service or maintaining a
state-storage API. A separate Terraform bucket stack would still need independent
state protection before its first apply. The existing Ansible controller and
maintained S3 module avoid that extra state. No custom S3 client is introduced.

Mandatory server-access logging targets an independently prepared private,
versioned audit bucket. The bootstrap checks its protection and delivery grants
without adopting or changing it. The maintained Ansible module enables source
logging; native provider tooling prepares destination ACLs outside this bootstrap.

The API contract tests use pinned Moto and official AWS CLI fixtures. SeaweedFS
was evaluated but does not implement `PutBucketLogging`. Production selection
remains subject to endpoint-specific qualification: an emulator cannot establish
OVH permissions, availability or retention behavior. OVH documents native S3
locking, but successful simultaneous-lock and recovery tests against the chosen
bucket, plus actual access-log delivery, remain required before operational use. Versioning retains billable
history; storage administration and reviewed expiry stay outside runtime access.

Ansible's bucket-info module lists buckets visible to the dedicated S3 identity
before filtering the selected name. It does not query other buckets' contents or
publish that catalogue. Bootstrap needs broader bucket-management permissions
than normal state operations, so use a separately scoped daily operator after
initial setup. Losing the entire provider account remains a separate failure
domain; this change proves independence from the managed host and local checkout.

Native OpenTofu execution and reporting belong in `ci-github-iac/actions/opentofu/test`;
the consumer retains encryption, locking and host-independent recovery assertions.
The official setup Action and native CLI are reused; the shared reporting adapter
covers OpenTofu's missing JUnit output.

## Review qualification

The bundled Trivy Ansible adapter does not yet read the module's `logging` input.
Initial review validation removed its suppression. [Trivy #11624](https://github.com/aquasecurity/trivy/pull/11624)
implements the missing mapping. On 2026-11-12, its regression failed against the
original adapter and passed with the fix; the Ansible adapter and scanner suites
also passed. The patched scanner found no failures in this repository's Ansible
source, including a passing access-logging check, without suppressions.
On 2026-11-12, the state workflow adopted the stable
[ci-github-iac 1.2.0 release](https://github.com/hoverkraft-tech/ci-github-iac/releases/tag/1.2.0)
for both native OpenTofu and Ansible tests; hosted state-recovery qualification passed.

On 2026-11-12, the owner approved a temporary exception while the upstream PR
awaits merge. It suppresses only `AVD-AWS-0089` at the production role and unmanaged
test-bucket paths, expires on 2026-12-12 and leaves every other finding blocking.
The exception file's FIXME links the upstream PR; engineering-office maintainers
must remove it and the custom Trivy configuration when the shared linter includes
the released fix. Access logging and its runtime assertions remain mandatory.
Final CI must pass with this explicitly bounded scanner exception; full scanner
validation without the exception remains pending.

On 2026-11-12, review also identified a CI feedback problem: the preceding Hermes
job took 42 minutes 26 seconds, with every scenario running sequentially. The
workflow now runs runtime, manual-backup and scheduled-recovery scenarios in
parallel on independent guests, preserving all assertions and source-host loss.
Test-only SSH pipelining and native connection reuse reduce per-task overhead;
group changes explicitly reset the connection. This uses more runners and repeats
host setup to shorten elapsed feedback time without sharing mutable VM state.
The scenario timeout is 25 minutes; hosted qualification establishes actual duration.

## OVH access-control compatibility correction on 2026-11-13

The initial bootstrap and Moto fixture required AWS Block Public Access.
OVH's published S3 compatibility matrix explicitly marks its read/write APIs as
unsupported in Regions, including the selected Paris endpoint. A successful
ListBuckets authentication check does not validate these APIs. Remove that
dependency before operational bootstrap; do not swallow unsupported API errors
or introduce a switch that disables all protection.

Use the supported private ACL with an explicit read-back of state grants before
backend initialization. Require owner-only FULL_CONTROL on state, and only
LogDelivery WRITE/READ_ACP plus optional owner FULL_CONTROL on the audit bucket.
The original audit check validated group grants but could accept an additional
canonical user. Reject that sharing before any state mutation. Reuse the existing
native lifecycle with no public-access-block configuration and add that rejection
case; preserve its anonymous state-read, encryption, locking and recovery checks.

This protects the configured ACL, but cannot prevent a privileged administrator
from later making resources public. Bucket administration remains separate from
daily state operations. Live anonymous state/audit access denial and actual log
delivery remain activation gates; neither source documentation nor Moto proves
the operational endpoint's behavior. The change keeps the existing maintained
Ansible collection and provider-native ACL setup, with no custom S3 client.

Trivy applies AWS checks to these S3-compatible tasks. Scope exceptions for
`AVD-AWS-0086`, `AVD-AWS-0087`, `AVD-AWS-0091` and `AVD-AWS-0093` to the production
role and matching unmanaged-bucket fixture, with the provider compatibility
reference and explicit protection limits. Other checks remain enabled. Reassess
these exceptions if OVH adds the APIs; removing the independent logging-adapter
exception must not remove the configuration still needed for this target.

## References

- [OpenTofu state and plan encryption](https://opentofu.org/docs/language/state/encryption/)
- [OpenTofu S3 backend and locking](https://opentofu.org/docs/language/settings/backends/s3/)
- [Ansible S3 bucket module](https://docs.ansible.com/projects/ansible/latest/collections/amazon/aws/s3_bucket_module.html)
- [OVH native S3 locking](https://blog.ovhcloud.com/en/posts/terraform-s3-state-locking-ovhcloud-object-storage/)
- [OVH S3 compatibility](https://docs.ovhcloud.com/en/guides/storage-and-backup/object-storage/s3-s3-compliancy)
