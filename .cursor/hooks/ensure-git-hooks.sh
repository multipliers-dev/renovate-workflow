#!/usr/bin/env sh
# Portable sessionStart rechain + runnable-hook verify (team-harness marketplace primitive).
# Re-chain Husky after Cursor may install agent-hooks post-npm-prepare.
# Verify .husky/_ shims are runnable in this checkout; attempt repair; warn if still broken.
# Fail open: never block session start.
#
# prepare runs ensure-hooks too early on some Cloud VMs (socket present,
# ~/.cursor/agent-hooks not yet). sessionStart runs later and closes that gap.
# Wire as .cursor/hooks/ensure-git-hooks.sh + hooks.json sessionStart entry.
# Requires the repo to ship scripts/ensure-hooks.sh, scripts/verify-git-hooks.sh,
# and scripts/husky-shim-repair.sh (one-time copy from team-harness plugin).

trap 'exit 0' EXIT

command -v git >/dev/null 2>&1 || exit 0
repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$repo_root" || exit 0

ensure="$repo_root/scripts/ensure-hooks.sh"
[ -f "$ensure" ] && sh "$ensure" >/dev/null 2>&1 || true

verify="$repo_root/scripts/verify-git-hooks.sh"
[ -f "$verify" ] || exit 0

if sh "$verify" >/dev/null 2>&1; then
  exit 0
fi

repair_helper="$repo_root/scripts/husky-shim-repair.sh"
repaired=0
if [ -f "$repair_helper" ]; then
  # shellcheck source=/dev/null
  . "$repair_helper"
  if attempt_husky_shim_repair; then
    repaired=1
    [ -f "$ensure" ] && sh "$ensure" >/dev/null 2>&1 || true
  fi
fi

if [ "$repaired" = 1 ] && sh "$verify" >/dev/null 2>&1; then
  exit 0
fi

echo "HOOKS NOT RUNNABLE: run npm run prepare in this checkout before committing" >&2
