# Make and workflow conventions

Follow the [workstation-manager Makefile](https://github.com/neilime/workstation-manager/blob/main/Makefile)
and [workflow layout](https://github.com/neilime/workstation-manager/tree/main/.github/workflows).
Use annotated targets for `make help` and a shared `run_linter` helper for
`make lint` and `make lint-fix`. The linter runs on Linux amd64 with the caller's
UID/GID and the checkout's absolute path as its workspace. A failed image build
stops the command before linting.

`make lint-fix` applies supported automatic fixes. `make lint docs/` limits
linting to matching paths. Positional filters apply only to lint commands;
unknown standalone targets fail. `make ci` runs local linting with fixes.
Run `make e2e` separately on a KVM-capable host; see the
[validation guide](../usage/validation.md) for prerequisites and cleanup.

`main-ci.yml` and `pull-request-ci.yml` call `__shared-ci.yml`. Main supports
pushes and manual runs; PR CI also supports merge queues. Both cancel superseded
runs for the same workflow and ref. Start workflows with `permissions: {}` and
grant only the permissions required by each job. Keep step names descriptive,
Actions pinned and reusable orchestration in Hoverkraft. The aggregate `checks`
job requires every prerequisite to succeed and is required by branch protection.

Use Conventional Commits and reviewed pull requests. Keep the local fixture
revision derived from the pinned workflow reference in `__shared-ci.yml`.
Change that reference when adopting a shared CI update, then run the complete
VM lifecycle before merging.
