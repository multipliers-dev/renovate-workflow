#!/usr/bin/env sh
# Portable Cloud-aware prepare (team-harness marketplace primitive).
# Install git hooks for local + Cursor Cloud; skip on Vercel / GitHub Actions / CI.
# Cursor Cloud VMs may set CI=true, so CI alone is not enough to skip.
# Default On does not invoke this — wire package.json "prepare" per repo.
set -e

HUSKY_INSTALLED=0

is_cursor_cloud() {
  [ -d "${HOME}/.cursor/agent-hooks" ] || [ -S "${CURSOR_AGENT_SOCKET:-/run/cursor/api.sock}" ]
}

should_install_husky() {
  if [ "$HUSKY" = "0" ]; then
    return 1
  fi
  if is_cursor_cloud; then
    return 0
  fi
  if [ -n "$VERCEL" ] || [ -n "$GITHUB_ACTIONS" ] || [ -n "$CI" ]; then
    return 1
  fi
  return 0
}

skip_husky() {
  echo "Skipping husky install ($1)"
}

install_husky() {
  if command -v husky >/dev/null 2>&1; then
    husky
    HUSKY_INSTALLED=1
  else
    skip_husky "husky not installed"
  fi
}

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
# shellcheck source=husky-shim-repair.sh
. "$SCRIPT_DIR/husky-shim-repair.sh"

if should_install_husky; then
  install_husky
elif [ "$HUSKY" = "0" ]; then
  skip_husky "HUSKY=0"
else
  skip_husky "CI"
fi

# Fresh git worktrees inherit core.hooksPath but not executable .husky/_ shims until husky runs here.
if should_install_husky && attempt_husky_shim_repair; then
  HUSKY_INSTALLED=1
fi

verify_status=0
if [ "$HUSKY_INSTALLED" = "1" ]; then
  sh "$SCRIPT_DIR/verify-git-hooks.sh" || verify_status=$?
fi

# Final reconciliation: restore Cursor Cloud agent-hooks core.hooksPath after Husky.
# Always runs after verify — even when verify fails — so a bad shim state cannot skip
# agent-hooks reconciliation. Must run last so a late Husky repair cannot clobber the path.
# On Cloud, agent-hooks may appear later — see session-ensure-git-hooks.sh (sessionStart).
sh "$SCRIPT_DIR/ensure-hooks.sh"

exit "$verify_status"
