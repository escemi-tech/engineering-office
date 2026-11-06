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
requirement. CI uses disposable guest storage and synthetic data only.

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

No pruning or scheduling is enabled. Qualify the approved retention and expiry
policy before private use; do not delete the last verified recovery point to
resolve a failed backup. Restic's repository locks remain enabled. These commands
do not coordinate concurrent deployment or maintenance operators.

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
