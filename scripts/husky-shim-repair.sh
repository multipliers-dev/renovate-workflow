#!/usr/bin/env sh
# Shared Husky shim detection and repair (team-harness marketplace primitive).
# Sourced by prepare-git-hooks.sh and session-ensure-git-hooks.sh — single repair definition.
# Requires cwd = repo root (or caller cd's there before sourcing).

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

# Re-run husky when shims are missing or not executable. Returns 0 if husky ran.
attempt_husky_shim_repair() {
  needs_husky_shim_repair || return 1
  if command -v husky >/dev/null 2>&1; then
    echo "Husky shim missing or not executable in this worktree; re-running husky" >&2
    husky
    return 0
  fi
  return 1
}
