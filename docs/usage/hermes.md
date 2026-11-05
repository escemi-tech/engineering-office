# Run Hermes

The gateway provides authenticated conversations through an OpenAI-compatible API
at `127.0.0.1:8642`. It stores sessions in a dedicated Docker volume. Tools, memory
extraction, telemetry submission and passive update checks are disabled. Policy
files are mounted read-only; no host checkout, Docker socket or private source is
mounted into the runtime.

Use Linux with Docker Engine, Docker Compose v2 or later, and GNU Make. Allow
2 CPUs, 4 GiB RAM and at least 10 GiB free Docker storage. The upstream image uses
a root supervisor and runs the gateway as UID 10000. The image pin lives in
[compose.yml](../../services/hermes/compose.yml); Dependabot proposes updates.

## Try the synthetic demo

Install the APM CLI release selected by the
[Hermes test workflow](../../.github/workflows/test-hermes.yml), following the
[upstream installation guide](https://microsoft.github.io/apm/getting-started/installation/).
Compile the public writing policy before starting the fixture. Compilation uses
a fresh temporary project and writes only `.reports/hermes-writing-policy/AGENTS.md`;
it does not change this checkout's authored instructions or install skills.

From the repository root:

```sh
bash tests/hermes/helpers/prepare-policy.sh
bash tests/hermes/helpers/compose.sh up -d --wait --wait-timeout 180
```

This starts the real Hermes runtime and a fake inference endpoint on an internal
Docker network. It uses only public fixture credentials and cannot call a paid
model API. The Compose project `engineering-office-hermes-test` is reserved for
these disposable fixtures. Do not put real data in it.
The fixture mounts the compiled policy read-only in Hermes' configured working
directory. Its fake inference endpoint checks that the complete policy reaches
system context; putting the same text in a user message cannot satisfy the check.
Missing or stale compiled content fails the fixture. Rebuild after editing the
canonical writing policy, then recreate the fixture containers.

```sh
bash tests/hermes/helpers/compose.sh exec -T hermes sh -c '
  curl --fail http://127.0.0.1:8642/v1/chat/completions \
    -H "Authorization: Bearer $API_SERVER_KEY" \
    -H "Content-Type: application/json" --data-binary @-
' <<'JSON'
{"messages":[{"role":"user","content":"Prepare a synthetic briefing."}],"stream":false}
JSON
```

The response contains `Synthetic briefing: no connected sources.` This validates
the request path and instruction loading; the fixture does not evaluate writing
quality or generate intelligent answers. The configured deployment below does
not mount this test artifact. Remove the
demo and its disposable conversations when finished:

```sh
bash tests/hermes/helpers/compose.sh down --volumes
```

## Configure a model endpoint

The deployment requires an explicitly selected OpenAI-compatible model endpoint
and a scoped inference credential. Processor selection, private-source admission
and cloud hosting remain open gates; see the [permission policy](../development/assistant-security.md).
Only synthetic inference is currently covered by the repository's CI.

```sh
install -d -m 0700 .local
install -m 0600 services/hermes/runtime.env.example .local/hermes.env
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

Starting waits for the health check and returns an error if it fails. Stopping
preserves the state volume. Start again with the same command to resume it.
The configured project is `engineering-office-hermes`, separate from the demo;
stop the demo before using it. Access a remote host
through an SSH tunnel, keeping the listener on loopback. The gateway key controls
the Hermes API, including session management; share it only with the operator.

## State and recovery

The volume `engineering-office-hermes_state` holds native Hermes state, including
conversations and any upstream runtime configuration. Treat it as sensitive.
Stopping or replacing the container preserves it. Never run `down --volumes` for
an operational deployment unless its data is explicitly disposable.

Back up with Hermes stopped, preserving ownership and permissions. Restore into
a new isolated volume with the same image and reviewed configuration before
opening access. The repository's [restore test](../../tests/hermes/restore.sh)
demonstrates the procedure using synthetic state: it excludes the read-only
`config.yaml`, replaces the volume and checks the original session through the
API. It is a destructive test utility, not an operational backup command.

Encrypted backup storage, retention, credential delivery, host isolation and an
independent recovery drill must be implemented before private use. Container
permissions and the disabled toolsets do not establish those wider boundaries.
