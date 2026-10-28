# Validate the repository

Static validation requires Docker and GNU Make. `make lint` runs the same pinned
Hoverkraft linter used in CI, including YAML, workflow, IaC and secret checks.
Infrastructure-specific format/validate checks will accompany the first real
OpenTofu stack and Ansible playbook; no empty deployment stack is claimed valid.

The reference VM requires Linux x86-64, Python 3.10+, Lima, QEMU, access to
`/dev/kvm`, Git and outbound network access. No OVH or Bitwarden access is needed.

```sh
make setup
make e2e
```

`make setup` fetches the exact ci-github-iac commit pinned in `.github/workflows/__shared-ci.yml`.
`make e2e` calls that action's Python implementation, which creates the VM,
executes [our guest assertions](../../tests/e2e.sh), collects sanitized reports
and destroys the VM, including after failure. CI calls the shared workflow with
`test-script: tests/e2e.sh`; it does not depend on consumer Make targets.

The assertions validate a cold Ubuntu boot and synthetic guest read/write behavior.
They do not validate a production service or nested Proxmox. The shared action
supplies the default Ubuntu image and Lima configuration. Supply `vm-config` in
the workflow and the same `--vm-config` argument locally when adding a domain VM
configuration.

Each invocation uses its own short private Lima runtime under `/tmp`, removed
with its keys after verified teardown. Sanitized reports are written to `.reports/`.
For input options and cleanup recovery, see the shared
[VM validation guide](https://github.com/hoverkraft-tech/ci-github-iac/blob/0167859255277cc4b4010a42e5a9abc483be55da/docs/usage/vm-e2e.md).

`make plan`, `provision`, `configure`, `deploy`, `verify` and `backup` fail with an
explicit message until their implementations are delivered. These commands never
report success for an absent infrastructure stack.
