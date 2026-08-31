#!/usr/bin/env sh
# Verify Husky's shim layout exists in the current Git worktree.
# Fresh `git worktree add` checkouts inherit core.hooksPath but not .husky/_ until prepare runs.
# Only Git hook names the repo defines require shims; helpers like common.sh are ignored.
set -e

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

if ! REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null); then
  exit 0
fi

cd "$REPO_ROOT"

[ -d .husky ] || exit 0

missing=0
for hook_script in .husky/*; do
  [ -f "$hook_script" ] || continue
  hook_name=$(basename "$hook_script")
  is_git_hook_name "$hook_name" || continue
  if [ ! -x ".husky/_/$hook_name" ]; then
    echo "error: Husky hook shim missing or not executable in this worktree (.husky/_/$hook_name)." >&2
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "Run: npm run prepare" >&2
  exit 1
fi
