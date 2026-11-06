# Make and workflow conventions

Follow the [workstation-manager Makefile](https://github.com/neilime/workstation-manager/blob/main/Makefile)
and [workflow layout](https://github.com/neilime/workstation-manager/tree/main/.github/workflows).
Use annotated targets for `make help` and a shared `run_linter` helper for
`make lint` and `make lint-fix`. The linter runs on Linux amd64 with the caller's
UID/GID and the checkout's absolute path as its workspace. A failed image build
stops the command before linting. The shared image respects `.gitignore`; keep
local caches and generated reports excluded there.

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
result before merging.

Use Conventional Commits and reviewed pull requests. Pin all infrastructure test actions
to the same immutable revision in the workflow that owns the scenario. Update those references
together when adopting a shared CI change, then require the hosted VM job to pass
before merging.

## Repository automation

Keep the five Hoverkraft maintenance workflows alongside the CI entrypoints:

- `greetings.yml` welcomes first-time contributors on new issues and PRs.
- `need-fix-to-issue.yml` turns fix markers into issues after main pushes, or
  for a manually selected commit range.
- `semantic-pull-request.yml` validates Conventional Commit PR titles.
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

Declare APM Git dependencies as strings pinned to full commit SHAs, followed by
the matching release tag as an inline comment: `owner/repo#<40-character SHA> # vX.Y.Z`.
Dependabot updates both the SHA and tag comment to the latest eligible annotated
release tag. Use `# untagged` when no tag exists; do not invent a version or claim
that a SHA pin without upstream release tags receives automatic updates. Keep
other explanations on separate lines because Dependabot replaces inline comments.
APM version updates do not provide security updates. See
[GitHub's APM support reference](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories#apm).

The Hermes Compose image is pinned by release tag and digest. Renovate handles
the writing normalizer's `.node-version` through its native `nodenv` manager,
and Ansible/Terraform dependencies when their manifests are present. Dependabot
updates the normalizer's exact npm dependency pin and native lockfile. Keep its
English/French and format-preservation corpus as the dependency upgrade gate;
review changed behavior before accepting an update. Install with `npm ci --ignore-scripts`.
Duplication detection excludes generated npm lockfiles, matching ci-github-iac;
the zero-duplication threshold still applies to maintained code and fixtures.
See the [validation guide](docs/usage/validation.md#writing-normalizer) for its
dedicated test workflow and local command.

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

The Hermes workflow uses the released `ci-github-iac/actions/ansible/test` action
for its native host preparation, deployment and reboot tests. Host preparation
runs on the fresh Ubuntu VM before the Compose lifecycle. Runtime deployment
reuses that VM after the demo's synthetic state has been removed. The
shared action installs the pinned controller runtime and Galaxy requirements,
executes the test playbook and publishes native JUnit reports. Goss separately
checks the deployed service and filesystem boundaries. Assertions stay in these
test files; workflow steps only prepare and invoke the scenarios.

Keep the production entrypoints in `ansible/hermes-host.yml` and `ansible/hermes.yml`,
with their respective roles in `ansible/roles/hermes_host` and `ansible/roles/hermes`.
The tests exercise those entrypoints and repeat each role to verify convergence.
Keep the Lima fixture free of runtime installation logic. Reboot the deployed
guest through Ansible, then assert persistent state in Goss without redeploying.
Shared test inventory setup belongs in `tests/ansible/helpers/`.
The encrypted recovery scenario uses the production backup/restore entrypoints,
the distribution's Restic package and disposable guest storage. Retention tests
cover sparse expired history, daily/weekly limits, unrelated snapshots, future
timestamps and preserved recovery after pruning. Keep encryption,
snapshot selection and integrity checking in native Restic. Never run its
destructive fixture against an operational inventory. Shared synthetic runtime
settings and expected-rejection probes stay in the same explicit helpers directory.
Supply only synthetic inputs and the shared VM's
SSH configuration; never connect this test to an operational inventory. No generic
Ansible target-discovery job is needed for this concrete integration.

Dependabot updates the exact Ansible Core pin in `ansible/requirements.txt` through
its grouped pip configuration. Renovate's `ansible-galaxy` manager updates the exact
collection pins in `ansible/collections/requirements.yml`, including the Docker
collection's inventory-filtering dependency. Its `pyenv` manager updates
`ansible/.python-version`, which the upstream Python setup Action reads in CI.
Keep controller Python compatible with the pinned Core version. Linting and
syntax checks stay separate from tests.

For local syntax validation, install the pinned tools in an isolated environment
as described in the [deployment guide](docs/usage/hermes-deployment.md), then run:

```sh
ansible-playbook --syntax-check ansible/hermes-host.yml
ansible-playbook --syntax-check ansible/hermes.yml
ansible-playbook --syntax-check ansible/hermes-backup.yml
ansible-playbook --syntax-check ansible/hermes-backup-prune.yml
ansible-playbook --syntax-check ansible/hermes-restore.yml
ANSIBLE_CONFIG=tests/ansible/ansible.cfg ansible-playbook --syntax-check tests/ansible/hermes-host.yml
ANSIBLE_CONFIG=tests/ansible/ansible.cfg ansible-playbook --syntax-check tests/ansible/hermes.yml
ANSIBLE_CONFIG=tests/ansible/ansible.cfg ansible-playbook --syntax-check tests/ansible/hermes-reboot.yml
ANSIBLE_CONFIG=tests/ansible/ansible.cfg ansible-playbook --syntax-check tests/ansible/hermes-backup.yml
```

The actual deployment scenarios require the disposable VM and run in hosted CI.
Secret-bearing template and Compose tasks use `no_log`; never add debug output
that prints their inputs or full results. Use native Compose dotenv quoting in
the template, and retain the literal-character test when changing serialization.
