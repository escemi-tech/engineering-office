# Validate the repository

Static validation requires Docker and GNU Make. `make lint` runs the same pinned
Hoverkraft linter used in CI, including YAML, workflow, IaC and secret checks.
Infrastructure-specific format/validate checks will accompany the first real
OpenTofu stack and Ansible playbook; no empty deployment stack is claimed valid.

The reference VM requires Linux x86-64, Node.js 24.8 or later, Lima, QEMU, access to
`/dev/kvm`, Git and outbound network access. No OVH or Bitwarden access is needed.

```sh
make setup
make e2e
```

`make setup` fetches the ci-github-iac revision pinned by `vm/create` in
`.github/workflows/__shared-ci.yml`. Keep `vm/test` and `vm/destroy` on that same
revision. `make e2e` uses the shared local command to create the guest, execute
[our assertions](../../tests/e2e.sh) and destroy the VM, including after failure.
CI composes those three focused actions using their GitHub Script runtime.
`vm/test` parses results, renders summaries and annotations, updates a PR comment
and uploads completed reports. Its stable `report-name` keeps comments distinct;
fork and Dependabot PRs skip comments. The parser manages its own dependencies;
VM actions need no Python or npm setup. The workflow grants `pull-requests: write`
and schedules destruction with `always()`, including after reporting failure.
Use `command` instead of `test-script` for inline guest commands. Optional
`coverage: codecov` requires explicit report selection and `id-token: write`.

The assertions validate a cold Ubuntu boot and synthetic guest read/write behavior.
They do not validate a production service or nested Proxmox. The repository owns
[the Lima configuration](../../tests/lima.yml), including the pinned Ubuntu image
and guest resources. CI passes it through the required `vm-config` input;
`make e2e` passes the same file through the required `--vm-config` argument.

Each invocation uses its own short private Lima runtime under `/tmp`, removed
with its keys after verified teardown. Each test keeps its own sanitized report.
CI uses the report path returned by the action from runner temp; local runs print
their report paths under `.reports/`. To collect reports from test tools, set
`report-file` patterns on the test action (or `--report-file` locally) and write
those files into the supplied guest `REPORTS_DIR`. The parser consumes the
`report-files` output when present, otherwise the command-status `report`.
Collected report contents must be suitable for these public workflows.
For input options and cleanup recovery, see the shared
[VM validation guide](https://github.com/hoverkraft-tech/ci-github-iac/blob/4bd20d5cd4ab7358358a2cb0b6fca603b02dadfe/docs/usage/vm-e2e.md).

`make plan`, `provision`, `configure`, `deploy`, `verify` and `backup` fail with an
explicit message until their implementations are delivered. These commands never
report success for an absent infrastructure stack.
