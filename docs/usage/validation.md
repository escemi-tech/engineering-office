# Validate the repository

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

## Hermes lifecycle

The [dedicated workflow](../../.github/workflows/test-hermes.yml) runs on pull
requests and main pushes through shared CI. It composes the pinned
`ci-github-iac` VM creation, Goss testing and destruction actions. A disposable
Ubuntu VM receives Docker through the production Ansible host playbook, then
deployment assets and synthetic fixtures. No checkout or Docker socket is mounted inside Hermes.

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
After verified backup and pruning, it copies only the encrypted Restic repository
to a private runner directory, alongside the full snapshot ID and source machine
identity. The workflow destroys the entire source VM and its disks before
creating a fresh Ubuntu VM.

The [host-loss recovery scenario](../../tests/ansible/hermes-recovery.yml) repeats
production host preparation and convergence checks. It requires a different
machine identity and no inherited deployment or recovery files. The public
fixture supplies its synthetic key independently of the lost host. Native
Ansible transfers the retained repository, then the production restore entrypoint
verifies integrity and restores the exact snapshot. Recovery must remain inactive
until the scenario explicitly deploys reviewed assets and synthetic credentials.
The public backup check then runs against the restored repository while Hermes
is live; the running container identity and restart policy must remain unchanged.
[Goss](../../tests/hermes/backup.goss.yaml) reads the original session, checks a
restored file's content/ownership/mode, rejects an unrelated key, checks for a
plaintext canary in the encrypted repository, and verifies recovery credentials
stay outside Hermes. There is no inference fixture on the recovery host to
recreate the conversation. CI always schedules cleanup of both VMs and the runner
copy. Neither repository contents nor keys are uploaded as artifacts.

The job allows 60 minutes for the two sequential host preparations and runtime
downloads, with at most one VM active at a time. This qualifies recovery after
loss of the source guest. It does not establish an operational backup destination,
recovery after runner/provider loss, Bitwarden key recovery, automated retention
or a private operational disaster drill.

`make plan`, `provision`, `configure`, `deploy`, `verify` and `backup` fail explicitly
until cloud infrastructure and operational preflight are implemented. Use the
`hermes-start`, `hermes-stop` and `hermes-logs` targets for the local Compose runtime,
`hermes-host` to prepare an explicitly approved Ubuntu host, and `hermes-deploy`
to install or update its runtime.
Use `hermes-backup-check` to verify integrity and freshness, and `hermes-backup`,
`hermes-backup-prune` and `hermes-restore` for explicit stopped-state recovery
operations, following the [backup guide](hermes-backup.md).
