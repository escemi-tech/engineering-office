# Deploy Hermes to an approved host

Ansible prepares an approved Ubuntu host with Docker and Compose, then deploys
the reviewed Hermes assets, compiled writing policy and scoped credentials.
Host preparation and runtime deployment are separate commands. Neither creates
a cloud instance, opens a firewall or admits private sources.

Before deployment, approve the host, model processor, credentials and network
access under the [permission policy](../development/assistant-security.md).
Follow the [OVHcloud qualification guide](ovh-qualification.md) to identify the
target and complete quote. Budgets, independent management access and encrypted
backups remain prerequisites for an operational deployment. The `production`
GitHub environment is reserved for future automated delivery; no workflow deploys
to a real host. An operator runs this command after approving the target and change.

## Prepare the controller and host

Use a trusted Linux controller with GNU Make, the APM compiler selected in
`services/hermes/.apm-version`, and the Python version in `ansible/.python-version`.
Keep SSH access and Bitwarden
on this controller, outside the assistant runtime. Install the pinned Ansible
runtime in an isolated environment:

```sh
python3 -m venv .local/ansible
. .local/ansible/bin/activate
python -m pip install -r ansible/requirements.txt
ansible-galaxy collection install -r ansible/collections/requirements.yml
```

For host preparation, use Ubuntu 26.04 LTS amd64 with systemd, Python 3 and working
Ubuntu package repositories. CI qualifies the repository's [Ubuntu VM](../../tests/lima.yml). Allow
2 CPUs, 4 GiB RAM and enough Docker storage for the pinned image and state.
The SSH operator must be able to become root; add `--ask-become-pass` to a direct
Ansible invocation if required. Establish the SSH host key independently before
deployment. The playbook preserves normal host-key verification.

Reserve `/srv/engineering-office` and the Compose project
`engineering-office-hermes` for this deployment. Review existing files and state
before using those names on an existing host. Stop and back up a deployment made
from another directory before changing its owner or location.

## Supply the inventory and scoped settings

```sh
install -d -m 0700 .local
install -m 0600 ansible/hermes-inventory.example.yml .local/hermes-inventory.yml
install -m 0600 ansible/hermes-deployment.example.yml .local/hermes-deployment.yml
```

Fill the inventory with the approved host's private SSH address and operator
account. Host preparation needs only this inventory. For runtime deployment,
fill `hermes_runtime` from the professional Bitwarden items:

| Setting             | Required value                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `model`             | Approved model identifier                                                                                |
| `inference_url`     | Approved HTTPS endpoint ending in `/v1`; HTTP is permitted only for a loopback endpoint in the container |
| `inference_api_key` | Scoped inference credential                                                                              |
| `gateway_api_key`   | Distinct gateway credential with at least 32 random characters                                           |

Values must be nonempty strings without control characters. Embedded credentials,
query parameters and fragments are rejected in the endpoint URL. Extra keys in
`hermes_runtime` are rejected, so a vault session or deployment token cannot be
forwarded through this configuration mapping. Do not put credentials directly
on the command line or commit either private file. Keep their mode `0600`.

## Prepare the host

With the inventory configured and the Ansible environment active:

```sh
make hermes-host
```

The [host playbook](../../ansible/hermes-host.yml) checks the qualified platform,
installs Ubuntu's `docker.io`, `docker-compose-v2`, `make`, `python3-requests` and `restic`
packages, and starts and enables Docker. It uses Ansible's built-in modules and
the [Ubuntu package installation path](https://ubuntu.com/server/docs/how-to/containers/docker-for-system-admins/),
without another package repository or Galaxy role. Package versions come from
the host's configured Ubuntu repositories. Repeating preparation keeps installed
versions; operating-system security updates remain a separate operator task.
APT fails if installation would remove packages, including conflicting Docker
distributions. Review those conflicts rather than removing them automatically.

Preparation does not change operator group membership, daemon configuration or
SSH access, and does not reboot the host. It starts Docker, so review existing
containers and their restart policies before running it on a reused host.
Docker access is equivalent to host administration; production deployment uses
privilege escalation instead of granting the SSH account Docker group access.

An already prepared host can go directly to deployment. It needs GNU Make,
Python 3 with Requests, a rootful Docker daemon at `/var/run/docker.sock`, and
the Compose plugin version 2.18 or later. Only the Ubuntu platform above is
covered by this repository's complete preparation and deployment CI scenario.

## Deploy and update

From the checkout, with the Ansible environment active:

```sh
make hermes-deploy
```

This rebuilds policy on the controller, validates the inventory and settings,
copies only the runtime assets and shutdown Makefile, and converges the service.
The host receives a root-owned `.local` directory with mode `0700` and a credential
file with mode `0600`. Ansible hides credential task output and disables template
diffs. Docker reads that file; its path, rather than its values, is passed to the
Compose command. The file is not mounted into Hermes. The container receives
only the two service credentials and its model settings through the existing
Compose configuration. Docker administrators can still inspect that environment.

An unchanged deployment artifact does not replace the running container. Updates
to mounted configuration or policy recreate it so new conversations load them.
Credential and image changes use Compose's normal change detection. Recreation
interrupts service briefly and preserves the named state volume. Missing or invalid
settings fail before host files change. A deployment failure requires operator
inspection; there is no automatic rollback or deletion of existing state.

Use the [runtime guide](hermes.md) for API access and recovery. On the target,
the delivered Makefile supports independent shutdown and recent logs:

```sh
sudo make -C /srv/engineering-office hermes-stop
sudo make -C /srv/engineering-office hermes-logs
```

Redeploy from the controller to start or update the managed service. The target
contains deployment artifacts, not the policy source or compiler. Preserve incident
logs before recreation and follow the [revocation procedure](hermes.md#stop-and-revoke-access)
when replacing exposed credentials. Revoke provider keys independently; overwriting
the local file does not revoke a credential at its provider.

Unattended vault access, connector identities, provider revocation, production
approval automation and private-data recovery remain separate implementation work.
Use the [backup guide](hermes-backup.md) to prepare encrypted recovery material
and restore state before deploying a recovered runtime.

## Check gateway health

From the controller, with the Ansible environment active and the approved SSH
inventory configured:

```sh
make hermes-health
```

This checks the selected host's Docker daemon, requires exactly one running,
unpaused Hermes service with a passing native health check, verifies its
loopback-only port binding and requests `http://127.0.0.1:8642/health` on that host.
It does not follow redirects or use HTTP proxies or `.netrc` credentials. Docker
requests have a 10-second timeout; the HTTP request has a 5-second timeout.
Run it after deployment has finished, since a starting container is not yet healthy.

The command needs only the inventory and operator access, with the pinned Ansible
collections installed. It does not load the runtime credential file, compile
policy, make an inference request, read conversations or change service state.
Docker inspection results and HTTP response bodies are hidden. Success reports
gateway liveness and its numeric container restart count; missing, ambiguous,
stopped, paused, unhealthy or unreachable services fail with a diagnostic message.
A stopped service remains stopped, including when the kill switch disabled restart.

This is a point-in-time liveness check, not proof of working model credentials,
provider availability, private-source freshness or backup recoverability. Use
[`make hermes-backup-check`](hermes-backup.md#check-backup-integrity-and-age)
for manual backup verification. Use the [automatic backup guide](hermes-backup.md#enable-automatic-backups)
for scheduled verification and independent failure/missing-run notifications.
For failures, inspect restricted host logs using the [runtime runbook](hermes.md#stop-and-revoke-access);
do not publish logs or full container inspection output in shared diagnostics.
