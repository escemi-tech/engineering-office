#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."

# Use only synthetic credentials, including while Compose resolves the base file.
export HERMES_GATEWAY_API_KEY=synthetic-gateway-key-for-tests-only
export HERMES_MODEL=synthetic
export HERMES_INFERENCE_URL=http://inference:8080/v1
export HERMES_INFERENCE_API_KEY=synthetic-inference-key-for-tests-only
HERMES_TEST_IMAGE=$(docker compose --env-file /dev/null -f services/hermes/compose.yml config --images)
export HERMES_TEST_IMAGE

exec docker compose --env-file /dev/null \
	--project-name engineering-office-hermes-test \
	-f services/hermes/compose.yml -f tests/hermes/compose.yml "$@"
