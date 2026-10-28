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

`make setup` fetches the exact ci-github-iac commit pinned in the CI workflow.
`make e2e` attempts collection and teardown even after a failed startup or assertion.
CI invokes the same `e2e-up`, `e2e-test`, `e2e-collect` and `e2e-down` targets.
The fixture validates a cold Ubuntu boot and synthetic guest read/write behavior.
It does not validate a production service or nested Proxmox.

The fixture owns only `.cache/e2e/`, with sanitized reports under `.reports/`.
To inspect individual lifecycle steps, invoke the four targets in order and always
finish with `make e2e-down`. A pre-existing fixture is rejected for cold-start tests.

`make plan`, `provision`, `configure`, `deploy`, `verify` and `backup` fail with an
explicit message until their implementations are delivered. These commands never
report success for an absent infrastructure stack.
