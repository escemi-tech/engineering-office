# Back up and recover Hermes state

Use `make hermes-backup` for a stopped, approved Hermes deployment and
`make hermes-restore` for a fresh recovery volume. Native Restic encrypts the
state, checks repository integrity and verifies restored files. Ansible invokes
its CLI and manages the Docker volume; there is no custom archive format or
backup service inside Hermes.

The supported destination is an existing filesystem repository visible on the
target host. Before private use, qualify an independent backup filesystem and
recoverable key, retention, access controls and a recovery drill after losing the
original host. A repository on the runtime host's own disk does not meet that
requirement. The [synthetic CI scenario](validation.md#host-preparation-and-deployment)
retains an encrypted copy outside the guest, destroys that guest, and recovers the
original conversation on a fresh host with an independently supplied fixture key.
It does not qualify an operational storage destination or recovery of real keys.

## Prepare recovery material

Run [host preparation](hermes-deployment.md#prepare-the-host) to install Restic
from the configured Ubuntu repositories. Its updates follow the same operating
system maintenance process as Docker; no downloaded binary or extra release pin
is maintained here. The controller needs the pinned Ansible environment and an
approved inventory from the [deployment guide](hermes-deployment.md).

Use a dedicated repository and password for this professional domain. Keep the
password in Bitwarden and an independently recoverable offline copy. Deliver
only that password to a root-owned mode-`0600` file on the approved host, outside
Hermes state and the backup repository. Never supply a Bitwarden session to the
host or put the password in command arguments, Git or CI settings.

On the host, after mounting and verifying the approved backup filesystem:

```sh
mountpoint -q /mnt/engineering-office-backups
sudo install -d -m 0700 /mnt/engineering-office-backups/hermes /etc/engineering-office
sudo install -o root -g root -m 0600 /secure/input/restic-password /etc/engineering-office/restic-password
sudo restic --no-cache --repo /mnt/engineering-office-backups/hermes \
  --password-file /etc/engineering-office/restic-password init
```

The input file represents a password already obtained through the approved secret
delivery process; remove that temporary copy afterwards. Initialize a repository
once. An existing repository with a missing or wrong key must remain untouched.
Preserve the whole repository, including its `keys` and `config`, when transferring
an encrypted copy. Keep old keys until every backup requiring them expires.

On the controller:

```sh
install -m 0600 ansible/hermes-backup.example.yml .local/hermes-backup.yml
```

Edit its repository and password-file paths to match the target. These are
canonical absolute paths on the SSH host, not on the controller. The playbooks
require a root-owned mode-`0700` repository and a separate nonempty mode-`0600`
key file. They reject symlinks and noncanonical paths. They do not create a
repository, mount storage or retrieve a key from the vault.

## Take a consistent backup

Reserve an exclusive maintenance window. Do not deploy, start, modify or otherwise
write the selected volume while backup is running. On the target:

```sh
sudo make -C /srv/engineering-office hermes-stop
```

From the controller:

```sh
make hermes-backup
```

The playbook requires the gateway to be stopped with automatic restart disabled,
checks the repository and key, and backs up only the deployment's dedicated local
Docker volume. It excludes `config.yaml`, which deployment supplies from reviewed
source. The deployment credential file, backup key and controller files are outside
that volume. Restic preserves the remaining native state and ownership.

After full data verification, the command prints the snapshot's full ID. Record
it with the deployment commit and image digest in the private recovery record.
A nonzero Restic exit, including an incomplete backup, fails the operation.
Hermes stays stopped on both success and failure. Inspect any failure before
ending maintenance; use `make hermes-deploy` from the controller to restart it.

Scheduling is not enabled. Restic's repository locks remain enabled, but these
commands do not coordinate concurrent deployment or maintenance operators.

## Expire recovery points

During the same exclusive maintenance window, use this command instead of
`make hermes-backup` when retention is approved for the selected repository:

```sh
make hermes-backup-prune
```

This command creates and verifies a new stopped-state backup before deleting
anything. A failed backup or integrity check stops retention. It applies the
initial policy to the selected deployment's host, volume path and Hermes tag:

- Keep Restic's seven daily and four weekly recovery points, with overlapping
  points counted once. Calendar grouping follows the recorded snapshot timestamps;
  new backups use UTC.
- Remove any selected point older than 28 days according to the host clock,
  even if missed backups leave fewer daily or weekly points. Counts are ceilings,
  not a guarantee of continuous coverage.
- Preserve the newly verified snapshot. Reject future timestamps or a replacement
  older than one day; correct the clock or investigate the repository before retrying.

Restic selects the calendar points with a native dry run; Ansible applies the
absolute age limit and passes the resulting full IDs to `forget`. Retention
options alone do not impose a hard age limit: Restic combines them with OR, and
its duration options are relative to the latest snapshot. See the
[native retention semantics](https://restic.readthedocs.io/en/stable/060_forget.html#removing-snapshots-according-to-a-policy).

The command then runs `prune --max-unused 0` and a full data check, leaving Hermes
stopped. Pruning requires free scratch space. It reclaims repository-wide
unreferenced data, including data from earlier interrupted maintenance; it does
not remove unrelated snapshots. Content shared with a retained snapshot remains.
This does not provide secure erasure from storage-provider replicas or copies.

Record the reported new snapshot ID as the recovery point. Treat a nonzero exit
as an operator alert: inspect the failure and preserve the remaining repository.
A pruning failure can occur after snapshot removal, so review the actual state
before retrying; a retry requires another successful new backup. Do not manually
delete the last recovery point to make space. Once accepted, explicitly restart
with `make hermes-deploy`.

The policy runs only when invoked. Daily execution, failure notification,
independent storage expiry and private recovery remain activation requirements;
this manual command does not enforce a continuously running retention deadline.

## Restore without overwriting existing state

Prepare a fresh, isolated Ubuntu recovery host and make the encrypted repository
and independently recovered password available there. Keep external integrations
disconnected. Set the controller inventory to that host and update the recovery
paths in `.local/hermes-backup.yml`. Add `hermes_restore_snapshot` with the full
64-character snapshot ID selected from the private recovery record. Short IDs
and `latest` are rejected.

```sh
make hermes-restore
```

The playbook verifies repository integrity and the snapshot's Hermes tag, refuses
an existing destination volume, creates a new Compose-owned volume and runs
Restic restore with file verification. It does not remove old state, replace
configuration, deliver runtime credentials or start Hermes. A failed restore
leaves the new volume for inspection; do not retry over it or delete it until
the operator has reviewed the failure.

Review the matching deployment revision, read-only policy and fresh scoped
credentials. Reapply any source revocations or deletion requirements before
allowing access to restored data. Then explicitly deploy:

```sh
make hermes-deploy
```

Read a known original session through the authenticated API to verify recovery
without recreating it through a new model request. Preserve the original host
and backup until the isolated recovery is accepted. Follow the
[revocation procedure](hermes.md#stop-and-revoke-access) for an incident; restoring
data does not revoke provider credentials or reconcile future queued actions.
