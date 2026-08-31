#!/usr/bin/env sh
# Portable sessionStart rechain (team-harness marketplace primitive).
# Re-chain Husky after Cursor may install agent-hooks post-npm-prepare.
# Fail open: never block session start.
#
# prepare runs ensure-hooks too early on some Cloud VMs (socket present,
# ~/.cursor/agent-hooks not yet). sessionStart runs later and closes that gap.
# Wire as .cursor/hooks/ensure-git-hooks.sh + hooks.json sessionStart entry.
# Requires the repo to already ship scripts/ensure-hooks.sh (one-time copy).

trap 'exit 0' EXIT

command -v git >/dev/null 2>&1 || exit 0
repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
ensure="$repo_root/scripts/ensure-hooks.sh"
[ -f "$ensure" ] || exit 0

sh "$ensure" >/dev/null 2>&1 || true
