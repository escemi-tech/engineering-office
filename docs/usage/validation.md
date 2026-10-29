# Validate the repository

Static validation requires Docker and GNU Make. `make lint` runs the same pinned
Hoverkraft linter used in CI, including YAML, workflow, IaC and secret checks.
Infrastructure-specific format/validate checks will accompany the first real
OpenTofu stack and Ansible playbook; no empty deployment stack is claimed valid.

VM validation runs on GitHub-hosted Linux runners through
[the shared CI job](../../.github/workflows/shared-ci.yml). Pull requests and
main pushes run it automatically; the main workflow also supports manual runs.
The job composes the pinned `vm/create`, `vm/test` and `vm/destroy` actions,
using [our assertions](../../tests/e2e.sh). Keep all three actions on the same
immutable revision. The creation action installs Lima and QEMU on the runner.

`vm/test` parses results, renders summaries and annotations, updates a PR comment
and uploads completed reports. Its stable `report-name` keeps comments distinct;
fork and Dependabot PRs skip comments. The parser manages its own dependencies.
The workflow grants `pull-requests: write`
and schedules destruction with `always()`, including after reporting failure.
Use `command` instead of `test-script` for inline guest commands. Optional
`coverage: codecov` requires explicit report selection and `id-token: write`.

The assertions validate a cold Ubuntu boot and synthetic guest read/write behavior.
They do not validate a production service or nested Proxmox. The repository owns
[the Lima configuration](../../tests/lima.yml), including the pinned Ubuntu image
and guest resources. CI passes it through the required `vm-config` input.

Each invocation uses its own short private Lima runtime under `/tmp`, removed
with its keys after verified teardown. Each test keeps its own sanitized report.
CI uses the report path returned by the action from runner temp.
To collect reports from test tools, set `report-file` patterns on the test action and write
those files into the supplied guest `REPORTS_DIR`. The parser consumes the
`report-files` output when present, otherwise the command-status `report`.
Collected report contents must be suitable for these public workflows.
For input options and cleanup recovery, see the generated action documentation:
[create](https://github.com/hoverkraft-tech/ci-github-iac/blob/82a76b76c04772b7d959948bcb6657c88df182f3/actions/vm/create/README.md),
[test](https://github.com/hoverkraft-tech/ci-github-iac/blob/82a76b76c04772b7d959948bcb6657c88df182f3/actions/vm/test/README.md) and
[destroy](https://github.com/hoverkraft-tech/ci-github-iac/blob/82a76b76c04772b7d959948bcb6657c88df182f3/actions/vm/destroy/README.md).

`make plan`, `provision`, `configure`, `deploy`, `verify` and `backup` fail with an
explicit message until their implementations are delivered. These commands never
report success for an absent infrastructure stack.
