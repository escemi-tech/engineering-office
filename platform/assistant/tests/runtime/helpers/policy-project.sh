#!/usr/bin/env bash
set -euo pipefail
repository=$(cd "$(dirname "$0")/../../../../.." && pwd)
POLICY_PROJECT=$(mktemp -d)
export POLICY_PROJECT
trap 'rm -rf "$POLICY_PROJECT"' EXIT

# Give each build probe its own public source copy and generated files.
cp "$repository/Makefile" "$repository/AGENTS.md" "$POLICY_PROJECT/"
mkdir -p "$POLICY_PROJECT/platform/assistant" "$POLICY_PROJECT/features/writing"
cp -R "$repository/platform/assistant/runtime" "$POLICY_PROJECT/platform/assistant/"
cp -R "$repository/features/writing/policy" "$POLICY_PROJECT/features/writing/"
export PATH="$repository/.cache/apm:$PATH"
cd "$POLICY_PROJECT"
bash -euo pipefail
