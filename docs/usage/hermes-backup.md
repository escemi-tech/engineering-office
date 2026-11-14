# Back up and recover Hermes state

Use `make hermes-backup` for a stopped, approved Hermes deployment and
`make hermes-restore` for a fresh recovery volume. Native Restic encrypts the
state, checks repository integrity and verifies restored files. Ansible invokes
its CLI and manages the Docker volume; there is no custom archive format or
backup service inside Hermes.

Use an existing filesystem repository for manual maintenance or an independent
S3-compatible repository for automatic backups. A repository on the runtime
host's own disk does not protect against host loss. Qualify the storage account,
recoverable key, access controls and alert recipient before enabling automation.
The [synthetic CI scenario](validation.md#host-preparation-and-deployment)
backs up to an S3 service outside the guest, destroys that guest, and restores
the original conversation with independently supplied fixture credentials.
It does not qualify operational storage or recovery of real keys.

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
install -m 0600 platform/assistant/backup/hermes-backup.example.yml .local/hermes-backup.yml
```

Edit its repository and password-file paths to match the target. These are
canonical absolute paths on the SSH host, not on the controller. The playbooks
require a root-owned mode-`0700` repository and a separate nonempty mode-`0600`
key file. They reject symlinks and noncanonical paths. They do not create a
repository, mount storage or retrieve a key from the vault.

### Independent S3 storage

Choose a bucket outside the Hermes host and its failure domain. Use a dedicated
professional storage identity restricted to that repository: list, read, write
and delete objects are required by Restic, including its locks and retention.
Account for full verification traffic, storage and request costs in the hosting
budget. Do not enable a provider lifecycle rule that deletes live Restic objects;
object expiry and copies must be aligned with the retention policy separately.

Keep the storage credentials in Bitwarden with independent recovery access.
Deliver a root-owned mode-`0600` AWS shared credentials file outside Docker state
and `/opt/engineering-office-backup/`. Its native format is:

```ini
[default]
aws_access_key_id = <dedicated access key>
aws_secret_access_key = <dedicated secret key>
```

Use an HTTPS endpoint and bucket path, with no embedded credentials or URL query.
Only loopback endpoints may use HTTP, for isolated tests or an authenticated
local tunnel. Credentials, keys and endpoint files must use canonical paths
without symlinks. On the approved target, initialize once using the protected
files, replacing the example endpoint:

```sh
sudo env AWS_SHARED_CREDENTIALS_FILE=/etc/engineering-office/backup-aws-credentials \
  restic --no-cache --repo s3:https://storage.example.invalid/hermes-backups \
  --password-file /etc/engineering-office/restic-password init
```

Set `hermes_backup_repository` to that S3 URL and add
`hermes_backup_aws_credentials_file` to the private recovery settings. The same
backup, check, retention and restore commands support this backend. Initialization
is explicit; no schedule creates a bucket, repository or replacement key.

## Enable automatic backups

Configure an independent [Healthchecks-compatible check](https://healthchecks.io/docs/http_api/)
and an alert recipient outside Hermes. Store its secret ping URL in a separate
root-owned mode-`0600` file, outside Docker state and the installed controller.
The check must alert on failure, missing execution and an overlong run. For the
example twice-daily schedule, use the matching UTC cron schedule and a 70-minute
grace period: the local worker times out after one hour. Test a failure and a
missed heartbeat with the real recipient before activation. A successful HTTP
response alone does not prove alert delivery or correct check configuration.

On the controller, prepare the approved inventory and schedule settings:

```sh
install -m 0600 platform/assistant/backup/hermes-backup-schedule.example.yml .local/hermes-backup-schedule.yml
```

Edit the endpoint, three protected file paths and explicit calendar. Set
`hermes_backup_schedule_enabled: true` only after storage, key recovery and
alert routing are accepted, then run:

```sh
make hermes-backup-schedule
```

The host needs the supported Python supplied by the deployment's Ubuntu release
and network access to install the repository's pinned Ansible/collection
requirements. Setup installs a private controller under
`/opt/engineering-office-backup/<project>` and a persistent systemd timer. The
example runs at 03:00 and 15:00 UTC. Systemd catches a missed tick after reboot
and allows only one active worker per project. Reapplying configuration suspends
the timer first and refuses to replace an active worker; resolve the failure and
reapply explicitly. Only this command enables the timer.

Each cycle authenticates the repository before interruption, records the exact
container and prior restart policy, stops it, creates and verifies a backup,
applies retention and verifies again. A previously running service resumes and
must pass the existing gateway health check before success is reported. An
intentionally stopped service stays stopped. Ordinary backup failures restore
the prior operating state and trigger the separate failure notification unit.
No data, logs, snapshot metadata or credentials are sent to monitoring: only
start, success and failure pings.

The worker has a one-hour limit, including verification and retention. Size the
repository and schedule so two complete scans fit that window. If the process
is killed or the host loses power while restart is disabled, Hermes stays
stopped; a later cycle does not infer that it should resume. Missing-success
monitoring is essential, especially when the host or notification endpoint is
unreachable. After an interrupted run, inspect the repository and service before
resuming; remove a stale Restic lock only after proving no writer remains.

On the target, inspect the schedule and bounded worker:

```sh
sudo systemctl status hermes-backup-engineering-office-hermes.timer
sudo journalctl -u hermes-backup-engineering-office-hermes.service
```

Keep journal access restricted. Detailed Restic, credential and container results
are suppressed; failure messages identify the failed operation for investigation.
Retain the successful snapshot ID with the deployment revision in the private
recovery record. Run the replacement-host restore drill before private use.

### Disable and maintain

On the target, stop the timer and any in-flight worker without credentials:

```sh
sudo make -C /srv/engineering-office hermes-backup-disable
```

`hermes-stop` performs this disable step before stopping the container and
removing its restart policy. It therefore prevents a backup worker from undoing
an operator shutdown. Manual backup, integrity, restore and deployment commands
require automation to be disabled; keep other operators out of the same
maintenance window. Direct Docker or Restic commands bypass this coordination.

For complete removal, set `hermes_backup_schedule_enabled: false` and rerun
`make hermes-backup-schedule`. This removes the managed units and private
controller, preserving recovery credentials, repository and Hermes state. It
does not delete provider accounts or the remote monitoring check. Pause that
check deliberately when decommissioning, rather than leaving unexplained alerts.

## Check backup integrity and age

With the same approved inventory and recovery settings, run from the controller:

```sh
make hermes-backup-check
```

The command checks the protected repository/key paths and runs Restic's full
`check --read-data`. It then requires a snapshot matching this Compose project's
backup host identity, Hermes tag and exact current Docker volume path. A fresh
snapshot from another deployment, tag or path cannot hide stale Hermes state.
The newest matching snapshot must be at most 24 hours old; any matching future
timestamp fails the check. This implements the initial daily-backup objective,
not an independently measured recovery guarantee. Keep the host clock correct.

A successful run reports integrity verification and the newest snapshot's age in
seconds. Raw snapshot metadata, file contents and credentials stay out of command
output. Missing state or recovery points, stale/future timestamps, wrong keys,
damaged data and repository access/locking failures return a nonzero exit.
Inspect the named failure, preserve existing backups and arrange a stopped-state
backup when freshness is the problem. Do not bypass verification or unlock a
repository while another operation owns its lock.

Hermes can be running or stopped. The check leaves its container, restart policy,
state and snapshots untouched; native Restic uses temporary repository locks.
Full verification reads all encrypted data and needs exclusive repository access,
so disable automation, reserve a suitable window and account for storage I/O.
A successful check describes that moment; it does
not replace a restore drill, independent storage/key recovery or ongoing monitoring.
Restic can retain a partial snapshot after a failed backup. Integrity and age
alone cannot establish that all intended source files were captured; always
review failed backup runs even when this check passes.

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
validates protected repository/key paths, and backs up only the deployment's dedicated local
Docker volume. It excludes `config.yaml`, which deployment supplies from reviewed
source. The deployment credential file, backup key and controller files are outside
that volume. Restic preserves the remaining native state and ownership.

Restic authenticates the key when opening the repository for backup. After a
successful backup, one full `check --read-data` verifies the entire repository,
including existing snapshots. No full data scan runs before backup. A standalone
backup therefore performs one full scan; its duration still grows with the
retained archive. A failed verification may leave a new, unverified snapshot;
preserve the repository and investigate rather than treating it as a recovery point.

After full data verification, the command prints the snapshot's full ID. Record
it with the deployment commit and image digest in the private recovery record.
A nonzero Restic exit, including an incomplete backup, fails the operation.
Hermes stays stopped on both success and failure. Inspect any failure before
ending maintenance; use `make hermes-deploy` from the controller to restart it.

Restic's repository locks remain enabled. These manual commands require the
automatic worker to be disabled; operators must still coordinate their own work.

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
stopped. The complete backup/retention operation performs two full scans: after
backup and after pruning. The first must pass before any snapshot deletion;
a post-prune failure reports failure and does not undo deletions. The explicit
backup-check command and restore preflight also retain full data verification.
Pruning requires free scratch space. It reclaims repository-wide
unreferenced data, including data from earlier interrupted maintenance; it does
not remove unrelated snapshots. Content shared with a retained snapshot remains.
This does not provide secure erasure from storage-provider replicas or copies.

Record the reported new snapshot ID as the recovery point. Treat a nonzero exit
as an operator alert: inspect the failure and preserve the remaining repository.
A pruning failure can occur after snapshot removal, so review the actual state
before retrying; a retry requires another successful new backup. Do not manually
delete the last recovery point to make space. Once accepted, explicitly restart
with `make hermes-deploy`.

The policy runs during each scheduled cycle or this manual command. Failed or
disabled cycles do not enforce a continuous expiry deadline; monitoring must
raise the resulting gap. Provider-side copies and private recovery still require
operational qualification.

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
