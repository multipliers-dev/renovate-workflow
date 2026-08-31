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

# Only Git hook names the repo defines require shims; helpers like common.sh are ignored.
is_git_hook_name() {
  case "$1" in
    applypatch-msg | pre-applypatch | post-applypatch \
    | pre-commit | pre-merge-commit | prepare-commit-msg | commit-msg | post-commit \
    | pre-rebase | post-checkout | post-merge | pre-push \
    | pre-receive | update | proc-receive | post-receive | post-update \
    | reference-transaction | push-to-checkout | pre-auto-gc | post-rewrite \
    | sendemail-validate | fsmonitor-watchman \
    | p4-changelist | p4-prepare-changelist | p4-post-changelist | p4-pre-submit \
    | post-index-change)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

needs_husky_shim_repair() {
  [ -d .husky ] || return 1
  for hook_script in .husky/*; do
    [ -f "$hook_script" ] || continue
    hook_name=$(basename "$hook_script")
    is_git_hook_name "$hook_name" || continue
    if [ ! -x ".husky/_/$hook_name" ]; then
      return 0
    fi
  done
  return 1
}

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)

if should_install_husky; then
  install_husky
elif [ "$HUSKY" = "0" ]; then
  skip_husky "HUSKY=0"
else
  skip_husky "CI"
fi

# Fresh git worktrees inherit core.hooksPath but not executable .husky/_ shims until husky runs here.
if should_install_husky && needs_husky_shim_repair; then
  echo "Husky shim missing or not executable in this worktree; re-running husky" >&2
  install_husky
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
