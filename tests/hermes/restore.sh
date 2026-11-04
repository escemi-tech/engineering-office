#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# Arrange: take a consistent backup with the gateway stopped.
backup=$(mktemp)
trap 'rm -f "$backup"' EXIT
bash tests/hermes/helpers/compose.sh stop hermes
bash tests/hermes/helpers/compose.sh run --rm --no-deps --entrypoint tar -T hermes \
	-C /opt/data --exclude=./config.yaml -czf - . >"$backup"

# Act: destroy the test volume and restore into a new one before startup.
bash tests/hermes/helpers/compose.sh down --volumes
bash tests/hermes/helpers/compose.sh run --rm --no-deps --entrypoint tar -T hermes \
	-C /opt/data -xzf - <"$backup"
bash tests/hermes/helpers/compose.sh up -d --wait --wait-timeout 180

# Assert: CI runs recovery.goss.yaml against the restored API session.
