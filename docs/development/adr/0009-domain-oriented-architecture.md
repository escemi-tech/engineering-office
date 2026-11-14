# ADR 0009: Domain-oriented source and inward application dependencies

- Status: Accepted
- Date: 2026-11-14

## Context

Top-level `packages/`, `services/`, `ansible/`, `tofu/` and central test directories
required following one capability across unrelated technology roots. The owner
requested feature-oriented organization, with briefing and writing under one
parent, and Clean Architecture / Domain Driven Design principles.

The GitHub collector combined admission policy, use cases and Octokit transport.
Its existing synthetic SDK and CLI tests already cover admission, partial
coverage, changing access, bounded requests, Copilot work and secret-safe errors.
The writing normalizer is a small deterministic module using qualified Polytypo.

## Decision

Use `features/briefing` and `features/writing` for user-facing capabilities,
`platform/assistant` and `platform/hosting` for their operational support, and
`tooling/` only for shared toolchain configuration. Keep tests with their owning
scope, using a common parent for scenarios spanning its children.

Use DDD for context ownership, vocabulary and invariants. Separate the briefing's
source policy, application use cases and adapters. Wire them in the package
entrypoint through one source port; retain the maintained Octokit and Zod
integration and its existing behavior contracts. The application owns the port;
the adapter translates provider records before returning discovery results.
No dependency injection framework or new package is required.

Preserve a compact normalizer and native infrastructure conventions. A bounded
context is not automatically a service, a credential boundary, or a mandatory
entity/aggregate/repository hierarchy. Ansible and OpenTofu remain appropriate
implementations of infrastructure operations inside their owning scopes.

## Alternatives

- Keep technology roots: fewer moved files, but capabilities and ownership remain
  scattered. This does not address the requested navigation and dependency issue.
- Add every Clean Architecture layer to every folder: more interfaces and wiring
  without a demonstrated effect boundary. Rejected for the normalizer and native
  infrastructure code.
- Create a general shared kernel or generic provider API: no second consumer
  currently justifies the coupling. Retain feature-specific policies and the
  existing provider SDK instead.

## Consequences

Paths in Make, workflows, dependency bots, scanner exceptions, examples and tests
move together. Installed service paths, Docker identities, backend keys and state
resource addresses do not change. Controller inventories and backend settings
must point to the new source root without discarding retained state or secrets.
The in-flight provisioning feature must adopt this layout before its next trial.
This decision does not complete live provisioning acceptance.

The package entrypoint now exposes `createGitHubBriefing()` to wire its use cases;
the operator command, arguments, JSON schema and admission behavior are retained.
No compatibility wrapper or second implementation is kept. Existing focused
behavior tests and hosted deployment/recovery suites qualify the move. A passing
local unit suite alone does not establish the infrastructure lifecycle.

This record complements ADRs 0001-0008. Their trust, source, runtime, writing,
state and management decisions remain in force. The current layout and dependency
rules are documented in the [architecture guide](../architecture.md).
