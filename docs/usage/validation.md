# Validate the repository

## Infrastructure state

The dedicated `test-infrastructure-state.yml` workflow tests the production
bootstrap against a pinned Moto S3 service, with a separate audit destination
prepared by the official AWS CLI fixture. Shared `opentofu/test` runs native
module assertions before the consumer-specific Ansible recovery lifecycle.
OpenTofu creates only synthetic `terraform_data` resources; no provider account
or paid resource is used.

The scenario verifies a read-only preview, repeatable private/versioned bucket
setup without AWS Block Public Access, mandatory access logging, encrypted state
and saved plans, anonymous state/audit read rejection, real
concurrent-lock exclusion, wrong-key rejection and recovery of the original
resource identity after deleting the local checkout and key. An unmanaged bucket
must remain unmodified, and an audit destination with another canonical reader
must be rejected before state mutation. The shared Ansible action publishes native JUnit results;
the common publisher consolidates them with the other test reports. Cleanup
removes the fixture volumes and every object version after success or failure.

These checks establish the implementation's S3 contract. They do not establish
the operational provider's permissions or capabilities. Qualify the selected
endpoint and independently recovered keys before managing cloud resources, as
described in the [state guide](infrastructure-state.md).

CI publishes three persistent PR comments: tests, coverage and lint. Each shows
a short summary with report and job details collapsed by default. Failures and
missing reports remain visible. Each producer retains its job summary and native
report artifacts. The final reporting job includes failed, cancelled and skipped
job states; individual lint and test jobs remain the merge checks. Coverage stays separate for each package.

Only artifacts from the current run attempt are included. A partial rerun can
omit reports from successful jobs that were not rerun; rerun all producer jobs for a
complete report. Missing reports never mean passing checks. Fork PR runs retain summaries and artifacts without publishing comments. Super-Linter's
native summary is included in the lint comment; CodeQL findings remain in code
scanning and Ratchet diagnostics remain in workflow logs.

Static validation requires Docker and GNU Make. `make lint` runs the pinned
Hoverkraft linter, including YAML, workflow, IaC and secret checks. `make ci`
applies the supported automatic lint fixes.

## Writing normalizer

The [dedicated workflow](../../.github/workflows/test-writing-normalizer.yml) uses
Hoverkraft's Node.js test action to run the package's native test suite and publish
JUnit/LCOV reports. Tests exercise the installed typography library against
English/French emails, reviews and briefings in plain text, Markdown and HTML.
The corpus covers locale spacing, idempotence, protected evidence and syntax,
Unicode, meaningful whitespace, technical notation and unsupported coverage.
All inputs are synthetic; the module has no external service or model dependency.

Use the package's `.node-version` runtime, then run:

```sh
cd packages/writing-normalizer
npm ci --ignore-scripts
npm run test:ci
```

Dependency updates run the same suite; investigate output changes rather than
automatically rewriting expected fixtures. To verify offline operation, install
dependencies first and run the suite in a disposable container with `--network none`.

Reports stay in the gitignored `.reports/` directory. No host provisioning or
credentials are needed. These tests qualify the [local adapter](writing-normalizer.md),
not a publisher or a client's instruction loading.

## GitHub briefing source

The [dedicated workflow](../../.github/workflows/test-github-briefing.yml) uses the
same Hoverkraft Node.js action to test the installed GitHub SDK and validation
library with synthetic HTTP responses. Suites cover provenance, minimal data,
account and repository identity, scope admission, public/private visibility, old
unresolved work, relevance, pagination, partial coverage, request budgets, access
revocation, malformed records, sanitized failures and protected CLI inputs.
Operational cases cover protected policy generation, exclusions, non-overwrite,
300 admitted repositories, batch isolation, independent read-access checks,
quota-reset waits, deadlines and fairness when one repository has many tasks.
Mention scenarios cover both work types, query attribution, overlapping relevance,
revision changes, identity mismatches, inaccessible sources, partial results and
rate limits. A mention alone must not become a reply obligation or attention signal.
Review scenarios preserve the review signal alongside authorship, assignment or
mentions, reject unrelated authored/assigned results, and cover independent
pagination, incomplete results and access failures. Presentation must describe
requests to the account or its teams without inferring which target matched.
Copilot scenarios cover all task states, separate attempts, tasks without PRs,
opaque artifact IDs, creator/source restrictions, pagination, request limits,
missing permissions, incomplete or stale sessions, omission of attempts with
inconsistent timestamp ordering and access loss. Raw prompt and
error canaries must stay out of evidence. PR context scenarios cover resource-ID
resolution, multiple tasks per PR, task-only merged PRs, opaque cursor pagination,
review/check independence, unknown states, head changes, scoped fixed queries,
GraphQL errors and rate limits. These tests do not qualify live Agent Tasks access
or tasks created by other accounts.
Presentation tests use collector-produced synthetic snapshots to cover bounded
ordering, verified grouping across attempts, repository and identifier separation,
unknown review/CI states, merged PRs, partial and empty results, terminal controls
and unchanged JSON evidence. CLI tests exercise both formats and reject unsupported
formats through the protected entrypoint.

Use the package's `.node-version` runtime:

```sh
cd packages/github-briefing
npm ci --ignore-scripts
npm run test:ci
```

JUnit and LCOV reports stay in `.reports/`. Tests require no GitHub credential,
live API or model; they also run with networking disabled after installation.
The fixtures exercise the SDK through a replaced fetch transport. They qualify
the [source snapshot command](github-briefing.md), not GitHub's availability or
an assistant's interpretation. Keep raw response/error canaries out of reports.

## Hermes lifecycle

The [dedicated workflow](../../.github/workflows/test-hermes.yml) runs on pull
requests and main pushes through shared CI. It composes the pinned
`ci-github-iac` VM creation, Goss testing and destruction actions. A disposable
Ubuntu VM per scenario receives Docker through the production Ansible host
playbook, then deployment assets and synthetic fixtures. Three scenarios run in
parallel, each with a 25-minute timeout:

- `runtime`: policy build, Compose lifecycle, deployment, health and host reboot.
- `backup`: encrypted manual backups, retention and rejected recovery operations.
- `recovery`: scheduled backups, failure boundaries and recovery on a replacement host.

Every scenario prepares its own state and reports separately. A failing scenario
does not cancel the others; all scenarios must pass. Cleanup runs after success
or failure. No checkout or Docker socket is mounted inside Hermes.

The pinned upstream APM Action sets up the CLI version declared in
`services/hermes/.apm-version`. The workflow copies that complete distribution
and the public build sources into the VM, then invokes Goss through the shared
test action. The VM uses `make hermes-policy`, the same build required by normal
startup. Generated instructions stay in its `.build/` directory. There are no
external APM packages, shared build homes or workstation skill changes.

Assertions belong to the Goss scenarios. [Policy build checks](../../tests/hermes/policy-build.goss.yaml)
use a temporary project per command, prepared and cleaned by an explicit fixture
helper. Concurrent tests cannot change each other's source or generated files.
[Preflight checks](../../tests/hermes/preflight.goss.yaml) run before Hermes starts
and restore the deployment artifact after testing its absence.
[Startup](../../tests/hermes/goss.yaml) and [recovery](../../tests/hermes/recovery.goss.yaml)
scenarios check the running gateway. [Revocation checks](../../tests/hermes/revocation.goss.yaml)
then exercise independent shutdown and key rotation. Each invocation publishes its own named
JUnit report through the same shared action; workflow steps only prepare assets,
invoke scenarios and manage the service lifecycle.

The scenario checks:

- Rejection of an unqualified compiler before startup can call Docker, and
  preservation of authored instructions across failed and repeated builds.
- A failed or empty compilation leaves the previous artifact intact and cannot
  start the gateway using that older artifact.
- Rejection of a missing policy file by the deployment's own mount, without
  relying on the inference fixture to stop startup.
- Ubuntu/systemd startup and synthetic guest storage.
- Hermes health, blocked external test-network access, authentication rejection, an unprivileged
  gateway and protected installation/configuration files.
- A real Hermes conversation against fake inference that rejects unexpected
  models, credentials, tools or streaming requests. It also requires the entire
  compiled writing policy in system context and rejects user-supplied policy text
  as a substitute. The fixture checks compiled content against the canonical source.
- Read-only policy content and directory access for the gateway identity,
  inherited from the deployment without a test-only policy override.
- The original session after a gateway restart.
- The same session after a stopped backup, volume destruction and restore into
  a new volume. Recovery checks only read history; they cannot recreate it.
- Policy loading in a separate fresh conversation after restart and restore.
  These checks cannot recreate the original session used by the recovery assertions.
- Shutdown of an unresponsive gateway using only the Makefile and Docker, with
  no deployment configuration or credentials. Repeated stops preserve container
  logs and the state volume, disable restart and leave other projects/services running.
- A missing container is a no-op; an unavailable Docker daemon fails explicitly.
- Recreation with a replacement gateway key rejects the old key, accepts the
  new one, restores the configured restart policy and retains the original session.

Inference runs on an internal Docker network with no external model access.
The shared test action publishes Goss JUnit results, summaries and artifacts.
CI always schedules VM destruction, including after failure. The Compose demo's
state and backups stay inside that guest. The separate host-loss scenario below
temporarily retains an encrypted repository on the runner; neither is published.

See the [runtime guide](hermes.md#try-the-synthetic-demo) to exercise the same
Compose deployment locally. The test project is reserved for synthetic data;
its restore script deliberately destroys and replaces that project's volume.
These checks do not qualify a paid model, writing quality, cloud host or private
connector. They do not resolve APM's separate populated-workstation recovery gate.
Revocation uses synthetic gateway keys; it does not test provider credential
revocation. Host reboot recovery is checked separately below.

## Host preparation and deployment

The workflow starts with a fresh Ubuntu image without Docker. The released
`ansible/test` action runs the [host preparation scenario](../../tests/ansible/hermes-host.yml)
against the production [host playbook](../../ansible/hermes-host.yml). Native
assertions require an initial package installation, an unchanged second run and
preservation of the SSH operator's privileges. Only the disposable fixture then
grants that user Docker access for the Compose demo. [Goss host checks](../../tests/hermes/host.goss.yaml)
verify installed packages, Compose availability, the Docker socket and its enabled,
running service.

After the Compose lifecycle, the same disposable VM receives the actual
[Ansible deployment](../../ansible/hermes.yml). The released `ansible/test`
action runs [native test playbooks](../../tests/ansible/hermes.yml) with pinned
Ansible and Galaxy dependencies. Missing or excess credentials must fail before creating
the deployment directory. A valid deployment starts Hermes, and repeating it
must preserve the container identity with no asset or Compose changes.

[Goss](../../tests/hermes/deployment.goss.yaml) then verifies root-only credential
storage, policy permissions, absence of controller/operator credentials in the
gateway, exact preservation of special characters in a synthetic key, and a real
conversation. The fake inference service shares the deployed gateway's network
namespace and is accessed through loopback; it holds no provider credentials. This scenario
does not qualify production egress restrictions. Native Ansible reports and Goss
reports remain separate; see [CONTRIBUTING](../../CONTRIBUTING.md#ansible-validation).

After that conversation, the [health scenario](../../tests/ansible/hermes-health.yml)
runs the operator's public health-check playbook against the same deployment.
It verifies healthy output, absent/ambiguous services, paused and stopped gateways,
a failed native health check and an HTTP failure despite a passing native check.
Public synthetic canaries in container settings, health logs and response bodies
must stay out of captured diagnostics. Checks must report zero changes and preserve
the kill switch; only fixture cleanup deliberately resumes the disposable service.
The scenario retains the original container identity and restart policy.

The [reboot scenario](../../tests/ansible/hermes-reboot.yml)
uses Ansible's reboot module to restart the whole guest and wait for SSH and the
gateway health endpoint. It does not rerun host preparation or deployment.
Goss repeats the host checks and [reads the original conversation](../../tests/hermes/session.goss.yaml)
without submitting another inference request. This verifies automatic runtime
startup and persistent session storage. It does not test a new model request
after reboot or qualify provider availability.

The [backup scenario](../../tests/ansible/hermes-backup.yml) initializes
a disposable Restic repository with a synthetic password outside Hermes. It
exercises the public backup and restore playbooks, including missing/wrong keys,
refusal to back up a live source, refusal of ambiguous snapshot selection and
refusal to overwrite an existing volume. It runs the public retention entrypoint
against sparse expired and dense daily histories, checks the daily/weekly limit,
preserves an unrelated snapshot and rejects future timestamps without deleting
existing recovery points. Wrong keys and a live source also block retention.
The backup-check entrypoint must reject missing state or snapshots, stale history
despite fresh snapshots with another host/path/tag, wrong keys, future timestamps
and a separately corrupted repository copy. A successful check preserves the
stopped container, disabled restart policy and every existing snapshot. Failure
reports must exclude the synthetic password and plaintext state canary.
The [automatic backup scenario](../../tests/ansible/hermes-backup-schedule.yml)
uses a real SeaweedFS S3 service outside the guest and a synthetic heartbeat
recorder. It exercises a native systemd calendar tick, stopped/running state
preservation, verification and retention, rejected credentials, unavailable
monitoring, overlapping starts and the kill switch during storage interruption.
Removing automation must preserve the independently stored recovery point and
credentials. Dependabot updates both fixture images through their Compose pins.

The runner retains only the chosen snapshot ID and source machine identity in a
private directory. The workflow destroys the entire source VM and its disks
before creating a fresh Ubuntu VM; its S3 storage remains available. The monitor
fixture checks the HTTP contract and failure propagation, not real notification
routing or the upstream service's missed-run scheduler. Those require live
acceptance with the chosen monitoring service and recipient.

The [host-loss recovery scenario](../../tests/ansible/hermes-recovery.yml) repeats
production host preparation and convergence checks. It requires a different
machine identity and no inherited deployment or recovery files. The public
fixture supplies its synthetic key independently of the lost host. Native
Restic reads the independent S3 repository through the production restore
entrypoint, verifies integrity and restores the exact snapshot. Recovery must remain inactive
until the scenario explicitly deploys reviewed assets and synthetic credentials.
The public backup check then runs against the restored repository while Hermes
is live; the running container identity and restart policy must remain unchanged.
[Goss](../../tests/hermes/backup.goss.yaml) reads the original session, checks a
restored file's content/ownership/mode, rejects an unrelated key, and verifies
recovery credentials stay outside Hermes. The manual filesystem scenario also
rejects plaintext canary leakage into encrypted storage. There is no inference fixture on the recovery host to
recreate the conversation. CI always schedules cleanup of both VMs, fixture services and the runner
record. Neither repository contents nor keys are uploaded as artifacts.

The job allows 60 minutes for the two sequential host preparations and runtime
downloads, with at most one VM active at a time. This qualifies recovery after
loss of the source guest. It does not establish an operational backup destination,
recovery after runner/provider loss, Bitwarden key recovery, real alert delivery
or a private operational disaster drill.

`make plan`, `provision`, `configure`, `deploy`, `verify` and `backup` fail explicitly
until cloud infrastructure and operational preflight are implemented. Use the
`hermes-start`, `hermes-stop` and `hermes-logs` targets for the local Compose runtime,
`hermes-host` to prepare an explicitly approved Ubuntu host, and `hermes-deploy`
to install or update its runtime.
Use `hermes-backup-check` to verify integrity and freshness, and `hermes-backup`,
`hermes-backup-prune` and `hermes-restore` for explicit stopped-state recovery
operations, following the [backup guide](hermes-backup.md).

## Private administration

The dedicated `test-management.yml` workflow invokes the released native Molecule
action. Its scenario uses disposable Ubuntu/systemd containers and real WireGuard
and SSH traffic. It checks unsafe-input refusal, preserved unmanaged configuration,
convergence, private access, public and wrong-key rejection, denied forwarding,
retained identity across restart, revocation and independent console recovery.
A reachable neighbour is probed before enforcement so a later denial cannot pass
merely because routing or the service was absent.

The fixture needs privileged networking and runs only on a fresh GitHub-hosted
runner. No operational credentials, cloud resources or developer-host changes are
involved. Native destruction removes containers, volumes, networks and synthetic
keys; native JUnit joins the consolidated test comment. The workflow has a bounded
ten-minute scenario deadline plus time for cleanup and reporting.

Container restart validates systemd startup and retained configuration. Before
activation, independently qualify the real host's reboot, provider firewall,
private SSH and emergency console using the [administration guide](management-access.md).
