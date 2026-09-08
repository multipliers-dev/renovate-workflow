#!/usr/bin/env sh
# Portable session PATH prepend (team-harness marketplace primitive).
# Prepend the Node distribution prefix bin dir so Cloud Build-installed Node
# is visible in agent shells. Idempotent — safe to source repeatedly.
#
# Do not rewrite /usr/bin/node or Cursor exec-daemon binaries; only adjust PATH.

_prefix=${CLOUD_AGENT_NODE_PREFIX:-/usr/local}
_bin="${_prefix}/bin"

case ":${PATH}:" in
  *:"${_bin}":*) ;;
  *) export PATH="${_bin}:${PATH}" ;;
esac
