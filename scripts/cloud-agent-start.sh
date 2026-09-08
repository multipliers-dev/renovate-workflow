#!/usr/bin/env sh
# Portable Cloud Agent start (team-harness marketplace primitive).
# Prepend session PATH, log Node probe, then run repo-local ensure-hooks.

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
# shellcheck source=/dev/null
. "$SCRIPT_DIR/cloud-agent-session-path.sh"

MARKER="team-harness-cloud-node-path"
LOG_DIR="${HOME}/.cursor"
LOG_FILE="${LOG_DIR}/${MARKER}.log"

mkdir -p "$LOG_DIR"
{
  printf '=== cloud-agent-start %s ===\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'PATH=%s\n' "$PATH"
  if command -v node >/dev/null 2>&1; then
    printf 'node=%s\n' "$(command -v node)"
    node -v
  else
    printf 'node=not found\n'
  fi
} >>"$LOG_FILE"

# Block Cloud Agent work until agent-hooks bridge is live (fail closed, not silent skip).
ENSURE_HOOKS_MODE=wait ENSURE_HOOKS_WAIT_SECS="${ENSURE_HOOKS_START_WAIT_SECS:-120}" \
  sh "$SCRIPT_DIR/ensure-hooks.sh"
