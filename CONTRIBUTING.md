# Make and workflow conventions

Follow the [workstation-manager Makefile](https://github.com/neilime/workstation-manager/blob/main/Makefile)
and [workflow layout](https://github.com/neilime/workstation-manager/tree/main/.github/workflows).
Use annotated targets for `make help` and a shared `run_linter` helper for
`make lint` and `make lint-fix`. The linter runs on Linux amd64 with the caller's
UID/GID and the checkout's absolute path as its workspace. A failed image build
stops the command before linting. Local lint discovers files in the working tree,
including new files that have not been committed. The shared image respects
`.gitignore`; keep local caches and generated reports excluded there.

`make lint-fix` applies supported automatic fixes. `make lint docs/` limits
linting to matching paths. Positional filters apply only to lint commands;
unknown standalone targets fail. `make ci` runs local linting with fixes.
VM integration tests run in CI; see the
[validation guide](docs/usage/validation.md) for scenarios and reporting.

`main-ci.yml` and `pull-request-ci.yml` call `shared-ci.yml`. Main supports
pushes and manual runs; PR CI also supports merge queues. Both cancel superseded
runs for the same workflow and ref. Start workflows with `permissions: {}` and
grant only the permissions required by each job. Keep step names descriptive and
Actions pinned. Compose shared VM operations in the job, and review each job's
result before merging. Test actions and the shared linter use `comment: false`; the final shared
reporting job updates the test, coverage and lint comments with collapsed details.
The linter retains the permissions declared by its reusable workflow. Test jobs
need no comment permission. Keep the caller job ID `lint` aligned with the shared
linter so the publisher can associate its artifact with its job result.

Use Conventional Commits and reviewed pull requests. Pin all infrastructure test actions
to the same immutable revision in the workflow that owns the scenario. Update those references
together when adopting a shared CI change, then require the hosted VM job to pass
before merging.

## Repository automation

Keep the five Hoverkraft maintenance workflows alongside the CI entrypoints:

- `greetings.yml` welcomes first-time contributors on new issues and PRs.
- `need-fix-to-issue.yml` turns fix markers into issues after main pushes, or
  for a manually selected commit range.
- `semantic-pull-request.yml` validates PR titles with the repository's root
  commitlint configuration or the shared Conventional Commits defaults. It needs
  only `contents: read` to load that configuration.
- `renovate.yml` runs dependency updates weekly and on manual dispatch.
- `stale.yml` manages inactive issues and PRs daily using shared defaults.

The four collaboration workflows reuse pinned ci-github-common workflows.
Renovate uses the organization's `CI_BOT_APP_CLIENT_ID` Actions variable and
`CI_BOT_APP_PRIVATE_KEY` Actions secret. Its GitHub App must be installed on this
repository with the permissions requested by the token-generation step.
Keep the token scoped to this repository and the repository configuration in
`.github/renovate.json`. Dependabot owns Actions, Dockerfile, Docker Compose and
APM, npm and pip dependency updates, grouped per ecosystem with weekly checks and a seven-day
cooldown. The APM entry covers `packages/writing-policy/apm.yml`; this source
package currently has no dependencies to update. When introducing another APM
consumer, add its manifest directory and commit its native lockfile. Dependabot
regenerates existing lockfiles but does not create them.

The shared linter temporarily excludes only `.github/dependabot.yml` because
zizmor rejects the supported `apm` ecosystem during schema validation. This
exclusion applies to all Super-Linter checks on that file, including formatting;
GitHub's native Dependabot configuration validation remains active. Workflow
security checks remain enabled. Remove the matching exclusions from `Makefile`
and `shared-ci.yml` once the bundled zizmor accepts APM. For this file, check
formatting directly with the repository image's `prettier --check` command.

Trivy temporarily ignores only `AVD-AWS-0089` in the two Ansible paths listed in
[its exception file](.github/linters/trivy-ignore.yaml). Logging is configured and
tested; the bundled adapter does not read it. Engineering-office maintainers must
remove the logging exception once
[Trivy #11624](https://github.com/aquasecurity/trivy/pull/11624) is merged, released
and included in the shared linter. The logging exception expires automatically.

The same file limits AWS Block Public Access checks `AVD-AWS-0086`,
`AVD-AWS-0087`, `AVD-AWS-0091` and `AVD-AWS-0093` to the OVH state bootstrap and
its matching fixture. OVH does not implement those APIs; private ACL verification
and anonymous state/audit read denial remain required. Keep the Trivy
configuration while these provider-specific exceptions are needed, and reassess
them when OVH's API support changes. Other findings remain blocking. See
[the state decision](docs/development/adr/0007-recoverable-infrastructure-state.md#ovh-access-control-compatibility-correction-on-2026-11-13).

Declare APM Git dependencies as strings pinned to full commit SHAs, followed by
the matching release tag as an inline comment: `owner/repo#<40-character SHA> # vX.Y.Z`.
Dependabot updates both the SHA and tag comment to the latest eligible annotated
release tag. Use `# untagged` when no tag exists; do not invent a version or claim
that a SHA pin without upstream release tags receives automatic updates. Keep
other explanations on separate lines because Dependabot replaces inline comments.
APM version updates do not provide security updates. See
[GitHub's APM support reference](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories#apm).

The Hermes Compose image is pinned by release tag and digest. Renovate handles
package `.node-version` files through its native `nodenv` manager,
and Ansible/Terraform dependencies when their manifests are present. Dependabot
updates both packages' exact npm dependency pins and native lockfiles. Keep the normalizer's
English/French and format-preservation corpus as the dependency upgrade gate;
review changed behavior before accepting an update. Install with `npm ci --ignore-scripts`.
Duplication detection excludes generated npm lockfiles, matching ci-github-iac;
the zero-duplication threshold still applies to maintained code and fixtures.
See the [validation guide](docs/usage/validation.md#writing-normalizer) for its
dedicated test workflow and local command.

The GitHub briefing package has its own synthetic SDK/CLI contract suite and
[dedicated workflow](.github/workflows/test-github-briefing.yml). Keep source
admission in the protected operator policy and ADR, validate identity before reading records and
preserve sanitized failures. Do not add live API calls or credentials to its CI
fixtures. Review the explicit GitHub API protocol version against upstream
deprecation notices when maintaining the adapter; dependency bots do not update
that header. See the [source tests](docs/usage/validation.md#github-briefing-source).

The Hermes build and fixture share the compiler pin in
[`services/hermes/.apm-version`](services/hermes/.apm-version). The upstream APM
Action installs that release in CI; Dependabot updates the Action reference.
Renovate's scoped regular-expression manager updates the version file from
`microsoft/apm` releases; it does not manage APM package dependencies. Compiler
updates must pass the real Hermes instruction-loading and recovery scenario.
`make hermes-policy` compiles the public policy in a disposable project, never
over the repository's or a user's authored `AGENTS.md`. Deployment and CI consume
the same artifact and Compose mount. Keep generated content in `.build/`.
Keep Hermes assertions in its Goss scenarios. Run build and preflight scenarios
through the shared VM test action, alongside startup and recovery checks. The
workflow transfers the compiler distribution returned by the upstream setup
Action into the existing disposable VM; the shared test action owns Goss setup
and reporting. Build probes use isolated temporary projects, with fixture setup
and cleanup in `tests/hermes/helpers/`.

## Ansible validation

Private administration uses the released native Molecule action in
`test-management.yml`. The scenario lives in `tests/molecule/management` and
exercises the production playbooks over real SSH and WireGuard. Run its privileged
network fixtures only on a disposable GitHub-hosted runner. The scenario owns
creation and destruction; never run it against the workstation or an operational
inventory. The shared publisher collects its native JUnit reports.

Renovate maintains the WireGuard role and its collection dependencies in the
mixed Galaxy manifest. Install roles into `.local/ansible/roles` as documented in
the administration guide; the Make targets add that path explicitly. Dependabot
maintains controller dependencies and the systemd fixture's Compose digest.

The independent infrastructure-state scenario runs native Ansible and OpenTofu
against a pinned Moto S3 fixture, without a VM. The shared OpenTofu test action
executes native tests and owns runtime setup and reports; the Ansible test action
executes the consumer-specific backend and recovery lifecycle. Both feed the
common report publisher. Assertions stay in
`tests/ansible/infrastructure-state.yml` and its explicit helper. The synthetic
Terraform resource exists only under `tests/infrastructure-state`; production
bootstrap manages the backend bucket with the maintained S3 collection.

Renovate updates `tofu/.opentofu-version` from OpenTofu releases and the
`amazon.aws` collection through its existing Galaxy manager. Dependabot owns
the SDK pin in `ansible/requirements.txt` and shared Action references. The native state
lifecycle must pass when any of these change. Dependabot also maintains the Moto and official AWS CLI images in the fixture
Compose manifest. Recursive Dependabot directory matching discovers Compose
fixtures without adding a directory entry for each one. The CLI prepares the independently managed audit destination.

Run `tofu fmt -check -recursive tofu tests/infrastructure-state` with the pinned
binary, then the isolated Ansible scenario. Its fixture requires a disposable S3
service; do not point it at an operational bucket. Bootstrap check mode is tested
to make no bucket changes. Wrong-key recovery, actual concurrent locking,
encrypted state/plans, checkout loss and unmanaged-bucket refusal are acceptance
contracts. Do not replace these with mocked SDK results.
Use native `.tofu` files for OpenTofu's encryption syntax. The dedicated workflow
checks formatting with the pinned OpenTofu binary; native initialization and the
state lifecycle validate the configuration. Terraform-specific parsers do not
own this source.

The professional-host workflow runs native mocked provider tests and the Ansible
campaign reservation and cleanup ownership guards. It has no cloud credentials and creates no real cloud
resources. Keep provider plans and live qualification evidence private. Run the
production OpenStack lifecycle only through the reviewed plan and independent
cleanup procedure in the [host guide](docs/usage/host-provisioning.md). Renovate's
native Terraform manager owns the provider pin and lockfile; its Galaxy manager
owns `openstack.cloud`. Dependabot owns `openstacksdk` through the pip manifest.

The Hermes workflow uses the released `ci-github-iac/actions/ansible/test` action
in three parallel scenarios: runtime/deployment, manual backup/retention and
scheduled backup/host-loss recovery. Each owns a fresh Ubuntu VM and prepares
its own source state; the recovery scenario destroys that source before creating
its replacement. Runtime deployment reuses its VM after the Compose demo's
synthetic state has been removed. The
shared action installs the pinned controller runtime and Galaxy requirements,
executes the test playbook and publishes native JUnit reports. Goss separately
checks the deployed service and filesystem boundaries. Assertions stay in these
test files; workflow steps only prepare and invoke the scenarios.

Keep the production entrypoints in `ansible/hermes-host.yml` and `ansible/hermes.yml`,
with their respective roles in `ansible/roles/hermes_host` and `ansible/roles/hermes`.
The tests exercise those entrypoints and repeat each role to verify convergence.
Keep the Lima fixture free of runtime installation logic. Reboot the deployed
guest through Ansible, then assert persistent state in Goss without redeploying.
Shared test inventory setup belongs in `tests/ansible/helpers/`. The test-only
Ansible configuration enables SSH pipelining and uses native connection reuse.
Reset the connection after fixture group changes; keep the independent reverse
SSH tunnel separate so resets cannot disconnect storage. Use distinct matrix
report names, let all scenarios finish after a failure and always clean up.
The backup and host-loss recovery scenarios use the production backup/restore
entrypoints and the distribution's Restic package. Retention tests
cover sparse expired history, daily/weekly limits, unrelated snapshots, future
timestamps, failed backup/verification preventing deletion and preserved recovery
after pruning. Keep encryption,
snapshot selection and integrity checking in native Restic. Never run its
destructive fixture against an operational inventory. The workflow keeps the encrypted repository in an independent runner-side S3
fixture and only the snapshot/host identity record in a private runner directory.
It destroys the source VM, then creates a fresh recovery VM. Require a
different machine identity, absent deployment files and an independently supplied
synthetic key before restoring. Goss must read the original conversation without
new inference. Always schedule cleanup of both guests, the independent fixture services and the runner record; never
upload the repository or keys as artifacts. Shared synthetic runtime/recovery
settings and expected-rejection probes stay in the explicit helpers directory.
The backup-check entrypoint verifies integrity and the daily freshness objective
without changing the service or recovery points. Its negative cases use the same
disposable history, unrelated host/path/tag snapshots and a separately damaged
repository copy. Check both stopped and running services, and keep raw snapshot
metadata and fixture credentials out of reports.
Supply only synthetic inputs and the shared VM's
SSH configuration; never connect this test to an operational inventory. No generic
Ansible target-discovery job is needed for this concrete integration.

Dependabot updates the exact Ansible Core pin in `ansible/requirements.txt` through
its grouped pip configuration. Renovate's `ansible-galaxy` manager updates the exact
collection pins in `ansible/collections/requirements.yml`, including the Docker
collection's inventory-filtering dependency. Its `pyenv` manager updates
`ansible/.python-version`, supplied to the shared test actions through
`python-version-file`. Those actions compose the official Python setup Action;
consumer workflows do not repeat controller setup.
Keep controller Python compatible with the pinned Core version. Linting and
syntax checks stay separate from tests.

For local syntax validation, install the pinned tools in an isolated environment
as described in the [deployment guide](docs/usage/hermes-deployment.md), then run:

```sh
ansible-playbook --syntax-check ansible/hermes-host.yml
ansible-playbook --syntax-check ansible/hermes.yml
ansible-playbook --syntax-check ansible/hermes-health.yml
ansible-playbook --syntax-check ansible/hermes-backup.yml
ansible-playbook --syntax-check ansible/hermes-backup-check.yml
ansible-playbook --syntax-check ansible/hermes-backup-prune.yml
ansible-playbook --syntax-check ansible/hermes-restore.yml
ansible-playbook --syntax-check ansible/hermes-backup-schedule.yml
ANSIBLE_CONFIG=tests/ansible/ansible.cfg ansible-playbook --syntax-check tests/ansible/hermes-host.yml
ANSIBLE_CONFIG=tests/ansible/ansible.cfg ansible-playbook --syntax-check tests/ansible/hermes.yml
ANSIBLE_CONFIG=tests/ansible/ansible.cfg ansible-playbook --syntax-check tests/ansible/hermes-health.yml
ANSIBLE_CONFIG=tests/ansible/ansible.cfg ansible-playbook --syntax-check tests/ansible/hermes-reboot.yml
ANSIBLE_CONFIG=tests/ansible/ansible.cfg ansible-playbook --syntax-check tests/ansible/hermes-backup.yml
ANSIBLE_CONFIG=tests/ansible/ansible.cfg ansible-playbook --syntax-check tests/ansible/hermes-recovery.yml
ANSIBLE_CONFIG=tests/ansible/ansible.cfg ansible-playbook --syntax-check tests/ansible/hermes-backup-schedule.yml
```

The actual deployment scenarios require the disposable VM and run in hosted CI.
Secret-bearing template and Compose tasks use `no_log`; never add debug output
that prints their inputs or full results. Use native Compose dotenv quoting in
the template, and retain the literal-character test when changing serialization.

The operator health check reuses the `hermes` role's `health` tasks without running
deployment tasks. Keep Docker inspection and HTTP responses hidden, and report
only explicit safe fields. Its native Ansible scenario captures public-command
output to check redaction and failed-state behavior. Only that disposable fixture
may resume the service after testing the kill switch. The fresh-host recovery
scenario also checks liveness without an inference endpoint.
