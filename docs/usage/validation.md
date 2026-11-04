# Validate the repository

Static validation requires Docker and GNU Make. `make lint` runs the pinned
Hoverkraft linter, including YAML, workflow, IaC and secret checks. `make ci`
applies the supported automatic lint fixes.

## Hermes lifecycle

The [dedicated workflow](../../.github/workflows/test-hermes.yml) runs on pull
requests and main pushes through shared CI. It composes the pinned
`ci-github-iac` VM creation, Goss testing and destruction actions. A disposable
Ubuntu VM installs Docker and receives only deployment assets and synthetic
fixtures. No checkout or Docker socket is mounted inside Hermes.

The scenario checks:

- Ubuntu/systemd startup and synthetic guest storage.
- Hermes health, blocked external test-network access, authentication rejection, an unprivileged
  gateway and protected installation/configuration files.
- A real Hermes conversation against fake inference that rejects unexpected
  models, credentials, tools or streaming requests.
- The original session after a gateway restart.
- The same session after a stopped backup, volume destruction and restore into
  a new volume. Recovery checks only read history; they cannot recreate it.

Inference runs on an internal Docker network with no external model access.
The shared test action publishes Goss JUnit results, summaries and artifacts.
CI always schedules VM destruction, including after failure. Test state and
backups stay inside the disposable VM and are not published.

See the [runtime guide](hermes.md#try-the-synthetic-demo) to exercise the same
Compose deployment locally. The test project is reserved for synthetic data;
its restore script deliberately destroys and replaces that project's volume.
These checks do not qualify a paid model, cloud host or private connector.

## Infrastructure provisioning

Native Ansible validation activates only when test playbooks or collections are
added; see [CONTRIBUTING](../../CONTRIBUTING.md#ansible-validation). It remains
separate from the Hermes container lifecycle.

`make plan`, `provision`, `configure`, `deploy`, `verify` and `backup` fail explicitly
until cloud infrastructure and operational preflight are implemented. Use the
`hermes-start`, `hermes-stop` and `hermes-logs` targets for the Compose runtime.
