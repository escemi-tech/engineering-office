# Run Hermes

The gateway provides authenticated conversations through an OpenAI-compatible API
at `127.0.0.1:8642`. It stores sessions in a dedicated Docker volume. Tools, memory
extraction, telemetry submission and passive update checks are disabled. Policy
files are mounted read-only; no host checkout, Docker socket or private source is
mounted into the runtime.

For an existing approved SSH host, use the [Ansible deployment guide](hermes-deployment.md).
The commands below operate a Compose deployment from a local checkout.

Use Linux with Docker Engine, Docker Compose v2 or later, and GNU Make. Allow
2 CPUs, 4 GiB RAM and at least 10 GiB free Docker storage. The upstream image uses
a root supervisor and runs the gateway as UID 10000. The image pin lives in
[compose.yml](../../platform/assistant/runtime/compose.yml); Dependabot proposes updates.

## Try the synthetic demo

Install the APM CLI release selected by the
[compiler version file](../../platform/assistant/runtime/.apm-version), following the
[upstream installation guide](https://microsoft.github.io/apm/getting-started/installation/).
Both the demo and configured gateway require this compiler. Compilation uses
a fresh temporary project and writes only `.build/hermes/AGENTS.md`;
it does not change this checkout's authored instructions or install skills.

From the repository root:

```sh
make hermes-policy
bash platform/assistant/tests/runtime/helpers/compose.sh up -d --force-recreate --wait --wait-timeout 180
```

This starts the real Hermes runtime and a fake inference endpoint on an internal
Docker network. It uses only public fixture credentials and cannot call a paid
model API. The Compose project `engineering-office-hermes-test` is reserved for
these disposable fixtures. Do not put real data in it.
The deployment mounts the compiled policy read-only in Hermes' configured working
directory. The demo's fake inference endpoint checks that the complete policy reaches
system context; putting the same text in a user message cannot satisfy the check.
Missing or stale compiled content fails the fixture. Rebuild after editing the
canonical writing policy, then recreate the fixture containers.

```sh
bash platform/assistant/tests/runtime/helpers/compose.sh exec -T hermes sh -c '
  curl --fail http://127.0.0.1:8642/v1/chat/completions \
    -H "Authorization: Bearer $API_SERVER_KEY" \
    -H "Content-Type: application/json" --data-binary @-
' <<'JSON'
{"messages":[{"role":"user","content":"Prepare a synthetic briefing."}],"stream":false}
JSON
```

The response contains `Synthetic briefing: no connected sources.` This validates
the request path and instruction loading; the fixture does not evaluate writing
quality or generate intelligent answers. Remove the demo and its disposable
conversations when finished:

```sh
bash platform/assistant/tests/runtime/helpers/compose.sh down --volumes
```

## Configure a model endpoint

The deployment requires an explicitly selected OpenAI-compatible model endpoint
and a scoped inference credential. Processor selection, private-source admission
and cloud hosting remain open gates; see the [permission policy](../development/assistant-security.md).
Only synthetic inference is currently covered by the repository's CI.

```sh
install -d -m 0700 .local
install -m 0600 platform/assistant/runtime/runtime.env.example .local/hermes.env
```

Edit `.local/hermes.env` with the model name, endpoint URL ending in `/v1`, inference
key and a separate random gateway key of at least 32 characters. Keep credentials
in Bitwarden and this ignored local file. Empty values block startup. Do not use
the fixture credentials for this deployment.

```sh
make hermes-start
make hermes-logs
make hermes-stop
```

Starting rebuilds the policy with the qualified compiler, recreates the container
and waits for health. Recreation causes a brief interruption and preserves the
state volume. It ensures a policy update reaches new conversations instead of
leaving the old file mounted or cached. Existing session history is preserved;
start a new conversation when verifying updated instructions.

A missing or different compiler, failed compilation or empty output stops
`make hermes-start` before Docker is called, leaving an existing gateway running.
Direct Compose creation also rejects a missing compiled file; it does not build
or check its freshness. Use `make hermes-start` after source updates. Generated
policy is disposable build output, separate from session backups. Stopping
preserves state and needs no compiler or deployment configuration. Start again
with `make hermes-start` to recreate the gateway and resume normal supervision.
The configured project is `engineering-office-hermes`, separate from the demo;
stop the demo before using it. Access a remote host
through an SSH tunnel, keeping the listener on loopback. The gateway key controls
the Hermes API, including session management; share it only with the operator.

## Stop and revoke access

Run `make hermes-stop` on the Docker host as the recovery operator. It selects
only the `hermes` service in the `engineering-office-hermes` Compose project,
disables its Docker restart policy, stops it with a 60-second grace period, then
verifies shutdown. The command needs only the Makefile, Bash, GNU Make and access
to that Docker daemon. Missing `.local/hermes.env`, Compose files or compiled
policy, and an unresponsive gateway API, cannot block this path. A Docker error
returns failure; no matching container is a successful no-op. Repeating it is safe.

The stopped container, logs and state volume remain available. Other projects
and services are untouched. For the synthetic demo, use
`make HERMES_PROJECT=engineering-office-hermes-test hermes-stop`.
The project override selects the same project for all Hermes Make targets.
Docker's disabled restart policy prevents automatic restart, including after a
daemon restart. A deliberate start or external deployer can still restart the
service: suspend deployment automation before incident handling.

For suspected credential exposure:

1. Stop Hermes. If the host or Docker daemon cannot be controlled, use the
   independent host/provider administration path to isolate it and revoke
   provider credentials; do not assume a failed command stopped the service.
2. Keep the stopped container and volume while collecting restricted incident
   evidence. To find the container without Compose configuration, use
   `docker container ls --all --filter label=com.docker.compose.project=engineering-office-hermes --filter label=com.docker.compose.service=hermes`.
   Read its logs with `docker container logs <container-id>`. Keep them private;
   they can contain conversation data. Avoid full container inspection output,
   which includes environment credentials.
3. Revoke an exposed inference key at its provider. Replace the affected keys in
   Bitwarden and `.local/hermes.env`, retaining file mode `0600`. Generate a new
   gateway key of at least 32 random characters. Stopping does not revoke keys
   or cancel requests already accepted by an external provider.
4. Once the incident is resolved, run `make hermes-start`. Recreation loads the
   replacement credentials; `docker restart` alone does not update them. Verify
   the old gateway key receives HTTP 401 and the new key can read the expected
   session before reopening access. Recreating removes the old container and
   its Docker logs, so collect needed evidence first. The state volume survives.

This covers the current runtime and gateway credential. There are no connector
tokens, publishers or scheduled jobs yet. Their independent revocation, pending
action handling, host isolation and provider-specific recovery must be qualified
when those capabilities are added. Shutdown requires access to the correct
Docker context; it cannot stop a host the operator cannot reach.

## State and recovery

The volume `engineering-office-hermes_state` holds native Hermes state, including
conversations and any upstream runtime configuration. Treat it as sensitive.
Stopping or replacing the container preserves it. Never run `down --volumes` for
an operational deployment unless its data is explicitly disposable.

Use the [encrypted backup and recovery commands](hermes-backup.md) with Hermes
stopped. Restore into a new isolated volume with the matching image and reviewed
configuration before opening access. The commands preserve native state and
ownership while excluding the source-managed `config.yaml`.

The Compose-only [restore fixture](../../platform/assistant/tests/runtime/restore.sh) uses synthetic
state and destroys its test volume; operators use the Ansible recovery commands.
Independent storage and key recovery, retention, credential delivery and a private
recovery drill remain required before private use.
