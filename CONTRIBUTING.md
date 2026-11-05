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
APM and npm dependency updates, grouped per ecosystem with weekly checks and a seven-day
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

The Hermes fixture uses the upstream APM Action with an explicit CLI release.
Dependabot updates the Action reference. Renovate's scoped regular-expression manager updates
only its `apm-version` input from `microsoft/apm` releases; it does not manage APM
package dependencies. Compiler updates must pass the real Hermes instruction-loading
and recovery scenario. Compile the public policy in a disposable project, never
over the repository's or a user's authored `AGENTS.md`.

## Ansible validation

CI skips Ansible tests while no content is tracked under `ansible/` or
`tests/ansible/`. Adding content activates a test-playbook/collection matrix using the shared
`ci-github-iac/actions/ansible/test` action. Add `ansible/requirements.txt` with an
exact `ansible-core==X.Y.Z` pin in the same change. The upstream actions manage
collection runtimes and test execution. Playbook tests use the runner Python
and must target disposable environments prepared by the consumer.
Configure inventory and collection search paths in an Ansible configuration file
and pass it through `ansible-config`. Use `galaxy-requirements` for third-party
dependencies when those files are introduced.

The workflow executes only explicit `tests/ansible/*.yml` and `*.yaml` test
playbooks. Deployment playbooks are not test targets. Collection roots are selected by
`ansible/collections/ansible_collections/*/*/galaxy.yml`. Each collection runs in
its own job. Content without any selected target fails the readiness job.
Keep deployment and integration scenarios here. Linting stays in the linter job.
