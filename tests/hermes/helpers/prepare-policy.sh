#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."

# Build only public instructions in a fresh project; never compile over user files.
build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT
cp -R packages/writing-policy/. "$build_dir/"
(
	cd "$build_dir"
	apm compile --target hermes --local-only
)
test -s "$build_dir/AGENTS.md"
install -d .reports/hermes-writing-policy
install -m 0444 "$build_dir/AGENTS.md" .reports/hermes-writing-policy/AGENTS.md
