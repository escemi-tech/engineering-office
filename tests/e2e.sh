#!/usr/bin/env bash
set -euo pipefail

# The guest supplies its distribution metadata.
# shellcheck source=/dev/null
. /etc/os-release
test "$ID" = ubuntu
test -d /run/systemd/system
test ! -e /tmp/iac-fixture
printf '%s' synthetic >/tmp/iac-fixture
test "$(cat /tmp/iac-fixture)" = synthetic
rm /tmp/iac-fixture
