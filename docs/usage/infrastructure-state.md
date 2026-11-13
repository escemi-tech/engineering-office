# Prepare and recover infrastructure state

Use `make infrastructure-state` to create a dedicated private, versioned S3 bucket
and initialize the professional host's encrypted OpenTofu backend. The bootstrap
uses the maintained Ansible S3 collection and has no provisioning state of its
own. Repeating it preserves existing state and unrelated bucket tags. It refuses
an existing bucket without its ownership tags and provides no deletion operation.

This prepares infrastructure state storage. It does not create a VM or enable
Hermes. Cloud provisioning still requires the [OVH qualification](ovh-qualification.md).
The [disposable tests](validation.md#infrastructure-state) qualify native S3
behavior; the selected operational endpoint needs its own locking and recovery
qualification before managing infrastructure.

## Prepare the approved destination

Review the storage region, account permissions, billing and change approval first.
Use a dedicated bucket named `engineering-office-state-<unique-suffix>` outside
the managed host. Keep it separate from Hermes backups and from the independently prepared audit bucket. OVH's
[native S3 locking guide](https://blog.ovhcloud.com/en/posts/terraform-s3-state-locking-ovhcloud-object-storage/)
documents the conditional writes required by OpenTofu. Check the capabilities of
the actual endpoint; a compatible API name alone is insufficient.

The proposed OVH endpoint is the Paris region `eu-west-par`, separate from the
candidate GRA11 compute location. Review its Standard storage quote in Manager.
Version history, including lock-object versions, contributes to storage usage.
No automatic expiry deletes historical state in this bootstrap; agree a reviewed
history policy before sustained operation. Separate buckets and credentials do
not protect against loss of the entire provider account.

Create a dedicated professional S3 identity through the provider's native account
management and store its credentials in Bitwarden. Bootstrap requires bucket
listing and creation, tag/ACL/versioning/logging configuration, and access
to state and lock objects. Bucket discovery reads the S3 identity's bucket names;
only the selected bucket's details are inspected. Restrict the identity to this
purpose and do not reuse the runtime's backup identity. After bootstrap, a daily
state operator needs list/read/write access to the state key and read/write/delete
access to its `.tflock` key; bucket administration stays separate.
Access logging is mandatory. Supply an existing dedicated private audit bucket
in the same region, named `engineering-office-audit-<unique-suffix>`. The bootstrap
checks versioning, the LogDelivery group's `WRITE` and `READ_ACP` grants, and
absence of recursive logging before any state changes. Other ACL entries may
only grant `FULL_CONTROL` to the bucket owner; extra readers are rejected.
It never creates or modifies the audit destination. The Ansible collection enables
source logging but does not support the log-delivery canned ACL for destination setup.
Use the provider's native CLI procedure with the separately approved administrator:

```sh
# Use the approved endpoint, region and audit bucket name.
aws --endpoint-url "$state_endpoint" --region "$state_region" s3 mb "s3://$state_audit_bucket"
aws --endpoint-url "$state_endpoint" s3api put-bucket-acl --bucket "$state_audit_bucket" --grant-write URI=http://acs.amazonaws.com/groups/s3/LogDelivery --grant-read-acp URI=http://acs.amazonaws.com/groups/s3/LogDelivery
aws --endpoint-url "$state_endpoint" s3api put-bucket-versioning --bucket "$state_audit_bucket" --versioning-configuration Status=Enabled
```

Authenticate that administrative terminal using its dedicated shared credentials
file. These commands allocate billable storage and change permissions: run them
only after the destination and quote are approved. Do not enable logging on the
log destination itself. Record its retention and separately scoped reader access;
access logs contain source addresses and object names. See the
[OVH server-access logging procedure](https://docs.ovhcloud.com/en/guides/storage-and-backup/object-storage/s3-server-access-logging).
Prove actual delivery at the selected endpoint before activation; fixture delivery
is not provider qualification.

OVH's [S3 compatibility matrix](https://docs.ovhcloud.com/en/guides/storage-and-backup/object-storage/s3-s3-compliancy)
lists AWS Block Public Access as unsupported. The bootstrap uses private ACLs
and verifies the effective grants instead. It does not provide an account-level
guard against later administrative ACL changes. Keep bucket administration with
the bootstrap operator, restrict the daily operator separately, and verify that
anonymous reads of real state and audit objects are denied before activation.

Supply a native AWS shared credentials file, owned by the operator with mode
`0600`, using the `[default]` profile. Keep it outside the checkout. Separately
create a random encryption password of at least 32 characters in Bitwarden and
an independently recoverable offline copy. Deliver it to another operator-owned
mode-`0600` file outside the checkout. Do not generate replacement credentials or
keys during recovery. Record both locations privately; never put their contents
in Git, command arguments or CI settings.

Use the [isolated Ansible controller setup](hermes-deployment.md#prepare-the-controller-and-host).
Its requirements include the S3 SDK; install its Galaxy requirements as well.
Install OpenTofu from the official distribution at the release pinned in
[`tofu/.opentofu-version`](../../tofu/.opentofu-version). The bootstrap verifies
that version before any storage mutation.

## Preview and initialize

From the repository root:

```sh
install -d -m 0700 .local
install -m 0600 ansible/infrastructure-state.example.yml .local/infrastructure-state.yml
```

Edit both bucket names, endpoint, region and absolute paths to the two protected files.
Use canonical paths without symlinks. Review an existing destination before
replacing it. Preview with the same dedicated identity:

```sh
ansible-playbook ansible/infrastructure-state.yml \
  --extra-vars @.local/infrastructure-state.yml --check
```

Check mode reads the configured storage and reports proposed changes without
creating a bucket or initializing local state. After approving the actual
storage quote and configuration, run:

```sh
make infrastructure-state
```

The role creates or converges the owned bucket's private ACL and versioning,
enables access logging to the verified audit destination, verifies exclusive
owner access to the state bucket, writes location metadata to
`tofu/professional-host/.local/backend.hcl`, and runs native `tofu init`. It never
stores credentials in backend configuration. Changing an existing checkout's
backend requires explicit native migration; the role does not silently
reconfigure or copy existing state to another destination. If creation succeeds
but later setup fails, inspect and repair that bucket before retrying. An
untagged bucket left by an interrupted creation requires explicit operator
reconciliation; the role will not assume ownership.

OpenTofu enforces AES-GCM encryption for both state and saved plans, deriving the
key from the independently held password. The committed backend enables native
S3 conditional-write locking. Keep its key-provider and method names stable:
they are part of the encrypted format. No plaintext fallback is configured.

## Use and recover the backend

From a fresh terminal, select the dedicated state operator's files explicitly:

```sh
export AWS_PROFILE=default
export AWS_SHARED_CREDENTIALS_FILE=/absolute/path/to/professional-state-credentials
export AWS_SHARED_CONFIG_FILE=/dev/null
export AWS_EC2_METADATA_DISABLED=true
export TF_VAR_state_password_file=/absolute/path/to/professional-state-password
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_ROLE_ARN AWS_WEB_IDENTITY_TOKEN_FILE
```

Native operations run in `tofu/professional-host`. Keep any saved plans in its
ignored `.local/` directory with a restrictive `umask 077`. Never disable locking
or encryption to make a failed operation proceed. The workspace currently owns
the backend configuration; compute resources are added with the qualified host
provisioning feature. There is no operational resource apply command yet.

After losing a controller checkout, recover the reviewed repository, the private
state/audit bucket and region record and both credential/key files independently. Repeat the
bootstrap with the same destination. Existing remote state remains authoritative;
native initialization must successfully decrypt it. Verify the state and review
a plan before making changes. A wrong key must stop recovery without replacing
state. Keep earlier key material until every retained state and plan requiring
it has expired.

For an abandoned lock, first prove that its recorded writer has stopped. Inspect
the native lock diagnostic, then use `tofu force-unlock <LOCK_ID>` only for that
abandoned operation. Never automate force-unlock on a timeout. If the latest
state object is damaged or deleted, preserve the current object and version
history, select a known-good encrypted version through the provider's native
object-version interface, and verify it in an isolated recovery workspace before
restoring it. Versioning does not make a stale state safe to apply: reconcile its
resource identities with the provider before further changes.

Keep buckets, versions, endpoint settings and keys after removing a local
checkout. Decommissioning storage is a separate reviewed action after all
managed resources and recovery obligations have been reconciled. Close the
credential-bearing terminal when finished.
