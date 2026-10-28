# Validate the repository

Static validation requires Docker and GNU Make. `make lint` runs the same pinned
Hoverkraft linter used in CI, including YAML, workflow, IaC and secret checks.
Infrastructure-specific format/validate checks will accompany the first real
OpenTofu stack and Ansible playbook; no empty deployment stack is claimed valid.

The reference VM requires Linux x86-64, Node.js 24, Lima, QEMU, access to
`/dev/kvm`, Git and outbound network access. No OVH or Bitwarden access is needed.

```sh
make setup
make e2e
```

`make setup` fetches the ci-github-iac revision pinned by `vm/create` in
`.github/workflows/__shared-ci.yml`. Keep `vm/test` and `vm/destroy` on that same
revision. `make e2e` uses the shared local command to create the guest, execute
[our assertions](../../tests/e2e.sh) and destroy the VM, including after failure.
CI composes those three focused actions using their GitHub Script runtime and
publishes the JUnit report separately. No Python or npm installation is required.
The workflow schedules destruction with `always()` before artifact upload.

The assertions validate a cold Ubuntu boot and synthetic guest read/write behavior.
They do not validate a production service or nested Proxmox. The creation action
supplies the default Ubuntu image and Lima configuration. Supply `vm-config` on
the creation step and the same `--vm-config` argument locally when adding a domain VM
configuration.

Each invocation uses its own short private Lima runtime under `/tmp`, removed
with its keys after verified teardown. Sanitized reports are written to `.reports/`.
For input options and cleanup recovery, see the shared
[VM validation guide](https://github.com/hoverkraft-tech/ci-github-iac/blob/efe2b370eb7916999d28d84645da7d52fc3b9461/docs/usage/vm-e2e.md).

`make plan`, `provision`, `configure`, `deploy`, `verify` and `backup` fail with an
explicit message until their implementations are delivered. These commands never
report success for an absent infrastructure stack.
