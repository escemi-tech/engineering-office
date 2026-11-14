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
`tofu/.opentofu-version`, and the pinned controller dependencies. Keep it powered
on and connected for the entire campaign. Enable user lingering through the
operator's normal administration procedure so logout does not stop cleanup.
Persistent timers catch up after a controller restart; they cannot execute while
it is offline. Keep an independent OVH Console session available for recovery.

From the repository, prepare the isolated controller:

```sh
python3 -m venv .local/ansible
. .local/ansible/bin/activate
python -m pip install -r ansible/requirements.txt
export ANSIBLE_COLLECTIONS_PATH="$PWD/.local/ansible/collections"
ansible-galaxy collection install -r ansible/collections/requirements.yml -p "$ANSIBLE_COLLECTIONS_PATH"
install -d -m 0700 .local
install -m 0600 ansible/professional-host.example.yml .local/professional-host.yml
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

## Review and apply the exact plan

The qualified backend configuration must already exist at
`tofu/professional-host/.local/backend.hcl`. The native daily state profile is
selected independently from OpenStack. Keep plans and logs in the ignored private
`.local/` directory, and never upload them to public CI.

```sh
make plan
```

Read `tofu/professional-host/.local/reviewed-plan.txt`. Verify one b3-8, local disk,
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

Outputs are saved privately in `tofu/professional-host/.local/outputs.json`.
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
