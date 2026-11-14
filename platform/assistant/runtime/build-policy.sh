#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."

apm_version=$(cat platform/assistant/runtime/.apm-version)
if [[ "$(apm --version)" != "Agent Package Manager (APM) CLI version $apm_version ("* ]]; then
	printf 'Install APM %s before building the Hermes writing policy.\n' "$apm_version" >&2
	exit 1
fi

# Build only public instructions in a fresh project; never compile over user files.
build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT
cp -R features/writing/policy/. "$build_dir/"
(
	cd "$build_dir"
	apm compile --target hermes --local-only
)
test -s "$build_dir/AGENTS.md"
install -d .build/hermes
install -m 0444 "$build_dir/AGENTS.md" .build/hermes/AGENTS.md
