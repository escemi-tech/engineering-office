# Repository architecture

`engineering-office` owns professional assistant capabilities and their hosting.
Organize source by responsibility first. Native tool layouts live inside their
owning scope; dependency manifests stay with the component they maintain.

```text
features/
  briefing/
    github/                  Scoped GitHub and Copilot work evidence
  writing/
    policy/                  APM writing instructions
    normalizer/              Deterministic classified-prose normalization
platform/
  assistant/
    runtime/                 Hermes Compose configuration and policy build
    deployment/              Runtime delivery, prerequisites and health
    backup/                  Encrypted recovery and scheduled backup operations
    tests/                   Runtime, deployment and recovery integration
  hosting/
    host/                    Private administration and native OpenTofu root
    state/                   Independent state/audit storage and recovery
      tests/
tooling/
  ansible/                   Shared controller pins, collections and role lookup
  opentofu/                  Shared OpenTofu version pin
```

Each scope owns its tests. Assistant integration tests live at the common parent
because they exercise deployment, runtime and backup together. Host and state
fixtures stay under their respective scope. `.github/workflows/` coordinates the
existing dedicated suites; the root Makefile exposes operator commands.
`tooling/` contains shared tool configuration, never product logic or credentials.

## Domain boundaries and vocabulary

Use Domain Driven Design to keep meanings and invariants explicit. These are
logical contexts in one repository, not a request for separate services.

| Context            | Vocabulary and responsibility                                                  | Boundary                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Briefing           | Account, source policy, admitted repository, work item, evidence, coverage     | Source admission binds account, repository identity, name and visibility. Unavailable or partial evidence must remain visible.                            |
| Writing            | Draft, classified part, prose, verbatim evidence, locale, normalization result | Only explicitly classified prose may change; verbatim parts stay unchanged. Writing policy guides generation; normalization does not approve publication. |
| Assistant platform | Runtime, deployment, health, backup, recovery point                            | Delivers the approved capabilities and recovers runtime data. It does not grant source or publication authority.                                          |
| Hosting platform   | Host, private administration, encrypted state, audit storage                   | Owns infrastructure lifecycle and independently recoverable administration.                                                                               |

A GitHub repository is a source identity, not a DDD persistence repository.
Feature folders do not establish security isolation. Professional, personal and
client scopes still require their own approved identities and data boundaries.
No shared business model joins briefing evidence with writing drafts implicitly.
Any future integration must explicitly classify the text it passes to writing.

## Dependency direction

Apply Clean Architecture where application policy meets external effects:

```text
CLI -> composition root -> application -> domain
             |
             +-> GitHub adapter -> Octokit / GitHub
                       |
                       +-> domain
```

The composition root supplies the source adapter through an application-owned
port. The application does not import or construct the adapter.

In `features/briefing/github/src/`:

- `domain/source-policy.js` owns policy validation and exact repository admission
  matching. It has no network, filesystem, process or platform dependency.
- `application/github-briefing.js` owns policy preparation, account verification,
  collection orchestration and the snapshot/coverage result. Its source port
  exposes `viewer`, `discover`, `collectRepositories`, request count and limits.
  Discovery returns policy fields rather than Octokit response objects.
- `adapters/` owns GitHub requests, SDK response validation, provider query and
  pagination rules, CLI files/arguments and terminal rendering. Only this layer
  knows HTTP routes, native provider records and filesystem operations.
- `github-briefing.js` wires the real adapter through `createGitHubBriefing()` and
  exports `GitHubBriefingText` for rendering saved snapshots.
  Other callers use the package entrypoint instead of importing implementation
  files. Existing behavior suites exercise this production composition.

Imports point inward. Domain code must not import application, adapters, another
feature's internals or `platform/`. Application code may use domain code and
receive effectful collaborators; it must not import adapters. Adapters may use
application/domain contracts. Cross-feature calls use the owning package's
public entrypoint or its declared artifact, such as the compiled writing policy.

Pure libraries are allowed in business rules. Zod validates the source contract;
Polytypo implements typography in the small, deterministic writing normalizer.
The normalizer keeps one focused module: no network or persistence boundary
currently justifies extra layers. Keep npm exports, APM manifests, Ansible roles,
Molecule scenarios and OpenTofu modules native. Add a port when it separates a
real external effect from policy; do not build generic SDK wrappers, abstract
repositories, event buses or empty layer directories.

## Operational boundaries

Source layout does not rename deployed resources. Docker project/volume names,
installed service paths, backup worker layout and the remote state key remain
stable. Deployment maps reviewed source files to installed paths explicitly.
Compose receives the installed policy path from the deployment task; repository
execution uses its local build output. Moving the OpenTofu root changes its local
working directory, not its resource addresses or backend key. Initialize the new
working directory with the approved backend settings; retain state history and
its encryption key. Never recreate a backend to accommodate a source move.

State, plans, inventory, operational evidence and credentials are excluded from
Git. Bitwarden holds human-managed credentials and recovery keys with separate
identities for the professional domain. PR tests use synthetic data. The
[assistant authority policy](assistant-security.md) remains authoritative for
source admission and processing. A new source folder does not authorize access,
model processing, deployment or cloud spending.

Dependency automation follows the owning manifests. Dependabot maintains npm,
pip, APM, Compose images and Actions; Renovate maintains Node/Python/OpenTofu/APM
compiler pins, Ansible collections/roles and provider dependencies. Keep their
paths aligned when moving a component.

See [ADR 0009](adr/0009-domain-oriented-architecture.md) for the architectural
decision and [CONTRIBUTING](../../CONTRIBUTING.md) for validation commands.
