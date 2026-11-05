#!/usr/bin/env bash
set -euo pipefail
repository=$(cd "$(dirname "$0")/../../.." && pwd)
POLICY_PROJECT=$(mktemp -d)
export POLICY_PROJECT
trap 'rm -rf "$POLICY_PROJECT"' EXIT

# Give each build probe its own public source copy and generated files.
cp "$repository/Makefile" "$repository/AGENTS.md" "$POLICY_PROJECT/"
mkdir -p "$POLICY_PROJECT/services" "$POLICY_PROJECT/packages"
cp -R "$repository/services/hermes" "$POLICY_PROJECT/services/"
cp -R "$repository/packages/writing-policy" "$POLICY_PROJECT/packages/"
export PATH="$repository/.cache/apm:$PATH"
cd "$POLICY_PROJECT"
bash -euo pipefail
