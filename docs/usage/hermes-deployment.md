# Deploy Hermes to an approved host

The Ansible playbook installs the reviewed Compose assets, compiled writing policy
and scoped credentials, then waits for the gateway to become healthy. It uses the
existing Docker daemon on the selected SSH host. It does not provision a cloud
instance, install Docker, open a firewall or admit private sources.

Before deployment, approve the host, model processor, credentials and network
access under the [permission policy](../development/assistant-security.md).
Cloud target qualification, budgets, independent management access and encrypted
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

The target needs a supported Python 3 interpreter, GNU Make, a rootful Docker
Engine at `/var/run/docker.sock`, and the Docker Compose plugin, version 2.18 or
later. CI qualifies the repository's [Ubuntu VM](../../tests/lima.yml). Allow
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
account. Fill `hermes_runtime` from the professional Bitwarden items:

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
