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
grant only the permissions required by each job. Keep step names descriptive,
Actions pinned; compose shared VM operations in the job. The aggregate `checks`
job requires every prerequisite to succeed and is required by branch protection.

Use Conventional Commits and reviewed pull requests. Pin all three VM actions
to the same immutable revision in `shared-ci.yml`. Update those references
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
`.github/renovate.json`. Dependabot owns Actions and Docker updates; Renovate
handles Ansible and Terraform dependencies when their manifests are present.
The bootstrap has no such manifests yet. Schedules become active after these
workflows reach the default branch.

## Ansible validation

CI currently reports that no Ansible checks ran. Adding tracked content under
`ansible/` activates the shared `ci-github-iac/actions/ansible/test` action.
Add `docker/tooling/Dockerfile` with the project's pinned Ansible dependencies in
the same change. Configure inventory and collection paths in that image or its
Ansible configuration, using `/workspace` as the checkout mount.

The workflow selects top-level `ansible/*.yml` and `*.yaml` playbooks, excluding
`inventory.yml`, `inventory.yaml` and `inventory.*` files. Collection roots are
selected by `ansible/collections/ansible_collections/*/*/galaxy.yml`. Content without
any selected target fails validation; it is not silently skipped. The shared
action owns syntax/sanity checks and report publication. Keep deployment and
integration scenarios here.
