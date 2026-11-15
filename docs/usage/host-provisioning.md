# Provision and remove an approved OVH host

This feature manages one Ubuntu 26.04 b3-8 in GRA11, its SSH keypair and a dedicated
security group. It uses the existing Ext-Net network for a Basic Public IP and the
flavor's 50 GB local disk. It creates no private network, gateway, floating IP,
additional volume or automatic snapshot. Native OpenTofu owns plan/apply/destroy;
the maintained OpenStack Ansible collection provides independent test cleanup.

Cloud compatibility, real firewall denial, private cutover, reboot and interrupted
provisioning must pass the approved live campaign before this host is accepted.
Offline tests establish configuration and cleanup guards only.

## Prepare the controller and access

Complete the [quote and account qualification](ovh-qualification.md),
[state qualification and recovery](infrastructure-state.md), and
[private administration prerequisites](management-access.md). Use an independently
recoverable state password and the separate daily state S3 credentials.

Use a Linux controller with systemd user services, the pinned OpenTofu release in
`tooling/opentofu/.opentofu-version`, and the pinned controller dependencies. Keep it powered
on and connected for the entire campaign. Enable user lingering through the
operator's normal administration procedure so logout does not stop cleanup.
Persistent timers catch up after a controller restart; they cannot execute while
it is offline. Keep an independent OVH Console session available for recovery.

From the repository, prepare the isolated controller:

```sh
python3 -m venv .local/ansible
. .local/ansible/bin/activate
python -m pip install -r tooling/ansible/requirements.txt
export ANSIBLE_COLLECTIONS_PATH="$PWD/.local/ansible/collections"
ansible-galaxy collection install -r tooling/ansible/collections/requirements.yml -p "$ANSIBLE_COLLECTIONS_PATH"
install -d -m 0700 .local
install -m 0600 platform/hosting/host/professional-host.example.yml .local/professional-host.yml
```

Use a fresh shell without ambient OpenStack credentials or `TF_LOG`/`OS_DEBUG`.
Provide one native `clouds.yaml` outside the checkout, owned by this operator and
mode `0600`, with a profile named `engineering-office-provisioner`. It must select
GRA11, `https://auth.cloud.ovh.net/v3`, verified TLS and the exact `auth.project_id`.
Use a dedicated OpenStack user with Compute Operator and Network Security Operator,
after inspecting the project's live role matrix. Store its credentials in
Bitwarden separately from the state and runtime identities. Never commit them.

Fill the protected settings file with the reviewed OpenStack project UUID, public
Ubuntu image UUID, existing SSH public key, controller public IPv4 `/32`, separate
credential/key file paths and complete tax-inclusive quote. The example's zero
prices intentionally fail validation. Include compute, local disk, IPv4, retained
S3 storage and monitoring; the monthly ceiling is EUR 100. Recheck quota and image
availability before the live plan. Image replacement requires a new reviewed ID.

For a disposable run, set a fresh UUID and a fixed UTC expiry within two hours.
Reserve three billed hours at the all-in hourly rate, including a cleanup hour.
Each of the three sequential VM runs is limited to EUR 0.60: together with the
already reserved EUR 1 storage qualification and EUR 2 cleanup reserve, this fits
the EUR 5 campaign. Failed starts consume their allocation; they are not free
retries. The controller's protected campaign record must survive checkout loss.

For a separately approved retained host, set `qualification: null`. Its stable
name is `engineering-office`; automatic qualification cleanup refuses it.

## Isolated recovery host

Use a fresh dedicated checkout for each recovery exercise. Keep the primary host,
its controller and its backup intact until recovery is accepted. Do not copy its
`.terraform/`, variable files, saved plan, approval or campaign ledger into the new
checkout. Install the same pinned controller tools and prepare the qualified S3
backend settings at `platform/hosting/host/tofu/.local/backend.hcl`, mode `0600`.
Use the existing bucket and encryption setup; do not run a bucket bootstrap or
backend migration to create a recovery host.

Copy the host settings example to `.local/professional-host.yml`, set
`qualification: null` and supply:

```yaml
recovery:
  run_id: REPLACE_WITH_NEW_UUID
  expires_at: REPLACE_WITH_FIXED_UTC_DEADLINE
```

The deadline must be within two hours at apply and three billed hours must fit
the separately approved EUR 0.60 exercise allowance. Recovery does not read or
reserve an entry in the three-run provider campaign. Every new exercise needs
its own quote, exact plan approval and deadline; no recurring test spend is implied.

The server, keypair and group are named `engineering-office-restore-<UUID>`,
with recovery ownership metadata. Native init selects
`recovery/<UUID>/professional-host.tfstate` in the qualified backend, with its own
`.tflock`. Encryption and locking remain enabled. An initialized checkout for
another state is refused before planning/applying; do not bypass this with
`init -reconfigure`, state migration or workspace switching.

Supply an independently held S3 identity in `professional_host_state_credentials_file`.
Its native policy needs bucket listing, GetObject/PutObject on that exact state key
and GetObject/PutObject/DeleteObject on its exact lock key. Qualify explicit denials
for the primary state and lock, audit/backup objects, state/version deletion and
bucket administration. OVH can fall back to ACL permissions when an action is
absent from a policy, so allow statements alone do not prove isolation. Do not use
the bootstrap or primary writer identity. This procedure does not create or widen
account policies; credential qualification is required before the live plan.

Plan and approve the hash through the normal procedure, then use:

```sh
make recovery-expiry
make recovery-provision
```

The separate `engineering-office-recovery-provisioning.service` writer and
`engineering-office-recovery-expiry.service`/`.timer` use protected
`.local/recovery-expiry.yml` and `.local/recovery-cleanup.json`. They never stop
the primary writer or qualification timer. An existing recovery unit owned by
another checkout is refused. Keep this checkout and its credentials available
until provider cleanup is verified, including after an interrupted apply.

Use the existing management playbooks with a distinct WireGuard client/interface
and unused private addresses/routes. Verify the provider console and private SSH
before removing the scoped bootstrap rule through another approved plan. Preserve
the primary client's route. Follow the [restore procedure](hermes-backup.md#restore-without-overwriting-existing-state)
with the exact snapshot and separately recovered credentials. Keep the backup
schedule disabled and external integrations disconnected; verify the original
session without another model call. Record observed recovery time and snapshot age.

After acceptance, `make destroy-plan` and an approved `make recovery-provision`
perform normal native destruction. `make recovery-cleanup` independently verifies
absence and disarms expiry, including after failed or interrupted provisioning.
It checks exact recovery ownership and refuses retained/foreign resources. Keep
remote state history and the original backup. Remove only the recovery client's
interface/routes and this exercise's stopped user units; preserve the primary
controller and campaign records. An API outage or offline controller can delay
cleanup; the allowance is not a provider-enforced spending cap.

## Review and apply the exact plan

The qualified backend configuration must already exist at
`platform/hosting/host/tofu/.local/backend.hcl`. The native daily state profile is
selected independently from OpenStack. Keep plans and logs in the ignored private
`.local/` directory, and never upload them to public CI.

```sh
make plan
```

Read `platform/hosting/host/tofu/.local/reviewed-plan.txt`. Verify one b3-8, local disk,
Basic Public IP, owned group and keypair, no unquoted extras and no unrelated
deletions. The only incoming rules are UDP 51820 and, during bootstrap, TCP 22 from
the supplied `/32`. Default group rules are removed; no IPv6 ingress is allowed.
IPv4 egress remains available for installation and the runtime's approved services.

After the owner approves this concrete resource plan and quote, record its printed
SHA256 in a mode-0600 file
`.local/professional-host-approval.yml`:

```yaml
professional_host_approved_plan_sha256: REPLACE_WITH_APPROVED_PLAN_SHA256
```

For a disposable run, arm cleanup before applying:

```sh
make qualification-expiry
systemctl --user list-timers engineering-office-qualification-expiry.timer
make provision
```

For a retained host, use `make provision` after its separate approval. It applies
only the saved plan and checks its hash and input values.
It never silently replans. `make provision` runs the writer in a bounded systemd
unit so the expiry service can stop it before reconciling the cloud resources.
Do not bypass this unit for a paid qualification apply.

Outputs are saved privately in `platform/hosting/host/tofu/.local/outputs.json`.
Review them and inspect the host's SSH key through the independent provider console
before configuring SSH. Do not disable host-key checks. Establish the WireGuard
operator key and native client using the [management guide](management-access.md).
Use the existing `make management` and `make management-enforce` entrypoints.

After a verified fresh private SSH connection, set `bootstrap_ssh_cidr: null`.
Create and review a new plan; it must remove the bootstrap SSH rule without
replacing the host. For a disposable run, rearm with that exact configuration,
keeping the same UUID and expiry. Approve the new plan hash, then apply. Prove a
fresh public SSH failure, working private SSH, and the same boundaries after reboot.
Keep the console recovery path available throughout this procedure.

## Destroy or recover after interruption

Normal destruction uses the same state, native locking and approval checks:

```sh
make destroy-plan
# Review the destruction plan, then record its new approved hash.
make provision
```

Keep state versions and recovery keys. Never delete the backend buckets as part
of host cleanup. For disposable runs, finish with `make qualification-cleanup` to
verify absence through fresh provider reads and disarm expiry.

After cancellation, failed configuration or lost provider state, use:

```sh
make qualification-cleanup
journalctl --user -u engineering-office-qualification-expiry.service
```

The independent service stops the owned writer, then uses the protected run
configuration rather than OpenTofu state. It verifies the exact project, resource
names, run ownership markers and SSH public key before deleting anything. A server
with an attached retained volume is refused. After server deletion, it checks for
ports still using the group's public address before removing the group and keypair.
Unrecognized or remaining resources fail cleanup and block a subsequent run.

The fixed-deadline timer invokes the same service automatically. Native systemd
allows up to three attempts within the reserved cleanup hour. API outages or a
powered-off controller can still prevent deletion; budgets are not provider hard
caps. Use the independent OVH Console to inspect the recorded run and delete only
its confirmed resources if automated cleanup fails. Stopping a VM does not stop
billing. Confirm deletion before another run, and reconcile the encrypted state
through a fresh native plan after out-of-band cleanup.

Retain `.local/qualification-campaign.json`, the cleanup receipt, protected run
configuration and approved plan evidence for the campaign. Do not reset the ledger
to gain more runs. Keep the controller checkout and credentials until cleanup is
verified; then disable/remove its owned user units through normal systemd tooling.
