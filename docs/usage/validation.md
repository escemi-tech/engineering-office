# Validate the repository

Static validation requires Docker and GNU Make. `make lint` runs the same pinned
Hoverkraft linter used in CI, including YAML, workflow, IaC and secret checks.
Infrastructure-specific format/validate checks will accompany the first real
OpenTofu stack and Ansible playbook; no empty deployment stack is claimed valid.

VM validation runs on GitHub-hosted Linux runners through
[the shared CI job](../../.github/workflows/shared-ci.yml). Pull requests and
main pushes run it automatically; the main workflow also supports manual runs.
The job composes the pinned `vm/create`, `vm/test` and `vm/destroy` actions,
using [our Goss suite](../../tests/goss.yaml) for Linux, Ubuntu, systemd and
synthetic guest storage checks. Keep all actions on the same reviewed revision.
The shared action installs the pinned verifier, runs the suite, publishes native
JUnit summaries and PR comments, and uploads reports even after assertion failure.
The workflow always schedules VM destruction, including after reporting failure.

Add infrastructure assertions to the Goss suite. Use native resources first and
command resources for specific checks that need a probe. Native reports preserve
assertion details; never include credentials or private data. The workflow grants
`pull-requests: write`; fork and Dependabot PRs still receive summaries and artifacts.

The assertions validate a cold Ubuntu boot and synthetic storage. They do not
qualify a production service. The repository owns [the Lima configuration](../../tests/lima.yml),
including the image and guest resources. CI passes it through required `vm-config`.
Each VM has a private runtime, removed with its keys after verified teardown.
The [pinned action references](../../.github/workflows/shared-ci.yml) identify the
source revision and its generated documentation for inputs and cleanup recovery.

`make plan`, `provision`, `configure`, `deploy`, `verify` and `backup` fail with an
explicit message until their implementations are delivered. These commands never
report success for an absent infrastructure stack.
