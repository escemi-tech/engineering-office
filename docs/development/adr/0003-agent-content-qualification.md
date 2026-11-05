# ADR 0003: Writing-policy source and conditional APM delivery

Date: 2026-11-05

Status: Accepted source package; runtime adoption deferred pending qualification.

## Context and decision

The ecosystem plan selects an APM replacement pilot for skills and instructions.
Its goal is fewer configuration owners and less maintained distribution code,
with equivalent recovery and preservation of user files. Workstation-manager
already manages skills with Skillshare. Installing a second permanent manager
would not meet that goal.

Own one public [writing-policy package](../../../packages/writing-policy/apm.yml)
here. Its source covers English, French, channels and protected content without
private preferences. Keep domain overlays private. APM metadata prepares the
source for qualification; it does not activate runtime distribution. Do not add
a custom instruction compiler or replace workstation setup while the gate fails.

## Qualification evidence

Disposable Linux containers exercised the released APM 0.35.0 binary with public
or synthetic data. Its upstream SHA-256 sidecar matched the downloaded archive.
No workstation configuration, cloud service or model provider was used.

The skill fixture used the two existing workstation declarations at revision
`5b9a74d717b87c7b7c54fa713171e8a0eb5f43b7`:

- `ansible-community/ai-forge/ansible-content-development/module/skills/write-content`
- `ansible-community/ai-forge/ansible-content-development/module/skills/write-module`

Clean installation included both `SKILL.md` and `reference.md` files. Repeated
installation in the same container and cold frozen replay into an empty project
passed; frozen replay preserved the lockfile bytes. APM 0.34.0, used by the
reviewed Dependabot helper, regenerated the lockfile successfully. A clean
0.35.0 installation accepted that lockfile and passed `apm audit --ci --no-policy`.
This is CLI compatibility evidence, not a real Dependabot pull request.

In one retained build home, audit rejected a modified skill file. Uninstalling
one dependency preserved the other skill and an unrelated user-owned skill;
restoring the original manifest and lockfile reinstalled the removed dependency
and passed audit. The separate project's skill remained present. These checks
do not cover global profiles or all cross-domain ownership cases.

**Recovery failed when the generated project was retained but its build home
was fresh.** A second container running 0.35.0 against the same project removed
both generated skill directories, returned zero from `apm install --frozen`,
and logged that no trustworthy local deployment baseline was available.
The subsequent audit returned nonzero and reported four missing content files.
This also reproduced without running 0.34.0, so the evidence does not establish
an updater-version defect. Clean-project builds passed; this finding concerns
recovery of an already populated project with a fresh home.

Open upstream [issue #3391](https://github.com/microsoft/apm/issues/3391)
describes the same native-skill recovery failure when local deployment receipts
are absent. Our reproduction above is independent evidence for the workstation
fixture; the upstream report provides a place to follow its resolution.

### Reproduce the recovery failure

Use an empty disposable project with this manifest and the released CLI. The
revision below is dated qualification evidence, not an actively updated consumer.

```yaml
name: workstation-skills-pilot
version: 0.1.0
targets: [codex, copilot]
dependencies:
  apm:
    - ansible-community/ai-forge/ansible-content-development/module/skills/write-content#5b9a74d717b87c7b7c54fa713171e8a0eb5f43b7 # untagged
    - ansible-community/ai-forge/ansible-content-development/module/skills/write-module#5b9a74d717b87c7b7c54fa713171e8a0eb5f43b7 # untagged
```

1. In a disposable container, run `apm install`, then `apm install --frozen` and
   `apm audit --ci --no-policy`. All three succeed.
2. Retain that project directory, including `apm_modules`, generated skills and
   the lockfile. Destroy the container, including its home directory.
3. Mount the same project at the same path in a fresh container using the same
   CLI. Run `apm install --frozen`, then `apm audit --ci --no-policy`.
4. Expect both skills and their resources to remain. The observed install
   returned zero but removed the skills; the audit correctly rejected the result.

A synthetic local instruction package generated Copilot instructions and compiled
`AGENTS.md` when the destination was absent. Compilation preserved an existing
authored `AGENTS.md` and warned that generation was skipped. A successful install
or audit therefore does not prove that the requested instruction is active.
The writing-policy package in this change also passed native installation,
compilation, audit and frozen replay in a network-disabled container. Generated
AGENTS and Copilot files contained its French and protected-content sections;
no actual client-loading test was run.

## Consequences and reopening criteria

Retain existing workstation ownership. Keep this policy as source only, with
explicit [coverage limits](../../usage/writing-policy.md). No generated guidance
is mounted into the Hermes deployment, and its permissions remain unchanged.

Before migration, resolve and retest populated-project recovery without an
unsafe overwrite or an extra custom recovery layer. Complete a real bot update,
cross-domain isolation and actual Codex/Copilot/Hermes loading checks. Review
whether the accepted scope removes more custom ownership than it introduces.

Dependabot is the owner of APM dependency updates. Its configured weekly group
covers the writing-policy manifest, which currently has no external dependencies.
Use full SHA pins with matching inline release-tag comments; Dependabot maintains
both during release updates. See the [contributor convention](../../../CONTRIBUTING.md#repository-automation).

The skill upstream had no release tags at review, so the reproduction explicitly
marks those pins as untagged. Dependabot's SHA updates target annotated release
tags; branch tracking with a reviewed lockfile needs separate qualification before
claiming those declarations receive updates. Do not add competing updaters.

Sources: [APM 0.35.0](https://github.com/microsoft/apm/releases/tag/v0.35.0),
[install reference](https://microsoft.github.io/apm/reference/cli/install/),
[Dependabot APM implementation](https://github.com/dependabot/dependabot-core/tree/main/apm).
