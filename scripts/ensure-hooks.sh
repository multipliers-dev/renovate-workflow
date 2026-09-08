#!/usr/bin/env sh
# Portable Cloud husky bridge (team-harness marketplace primitive).
# Ensures Husky git hooks run when Cursor Cloud overrides core.hooksPath
# with its own agent-hooks dispatcher. Idempotent — safe to call repeatedly.
#
# Called from prepare-git-hooks.sh after `husky` once the repo wires prepare.
# Workaround for: https://forum.cursor.com/t/cloud-agent-skipping-custom-git-hooks/155256
#
# Cursor's dispatcher reads a single ~/.cursor/agent-hooks/*/.cursor-original-hooks-path
# for the whole VM. Point that at a stable per-user bridge that resolves the current
# repo at hook time, so multi-repo Cloud agents do not overwrite each other.
#
# Modes (ENSURE_HOOKS_MODE):
#   best-effort — default; configure when agent-hooks is present; no-op when absent
#   wait        — on Cloud, poll for agent-hooks then configure; fail if timeout
#   require     — on Cloud, fail unless agent-hooks bridge is live now (no wait)
#
# Observed on Cloud (mastermichaelt/resumes PR #104): healthy bridge → pre-commit ~8s;
# early commits with bridge missing → ~130–160ms (full lint-staged/lint/tsc/format:check
# recipe did not run). prepare/ensure-hooks can finish before agent-hooks exists.
#
# On Cloud, when agent-hooks exists, bridge misconfiguration is always fail-closed.

set -e

is_cursor_cloud() {
  [ -d "${HOME}/.cursor/agent-hooks" ] || [ -S "${CURSOR_AGENT_SOCKET:-/run/cursor/api.sock}" ]
}

find_agent_hooks_dir() {
  AGENT_HOOKS_ROOT="$HOME/.cursor/agent-hooks"
  if [ ! -d "$AGENT_HOOKS_ROOT" ]; then
    return 1
  fi
  for d in "$AGENT_HOOKS_ROOT"/*/; do
    [ -d "$d" ] || continue
    if [ -f "${d}.dispatcher" ]; then
      printf '%s\n' "${d%/}"
      return 0
    fi
  done
  return 1
}

wait_for_agent_hooks_dir() {
  wait_secs="${ENSURE_HOOKS_WAIT_SECS:-60}"
  start_epoch=$(date +%s 2>/dev/null || echo 0)

  while :; do
    if agent_hooks_dir=$(find_agent_hooks_dir); then
      printf '%s\n' "$agent_hooks_dir"
      return 0
    fi

    now_epoch=$(date +%s 2>/dev/null || echo 0)
    if [ "$now_epoch" -ge "$((start_epoch + wait_secs))" ]; then
      return 1
    fi
    sleep 1
  done
}

fail_cloud_hooks() {
  echo "[ensure-hooks] $1" >&2
  exit 1
}

if ! REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null); then
  exit 0
fi

MODE=${ENSURE_HOOKS_MODE:-best-effort}
case "$MODE" in
  best-effort | wait | require) ;;
  *)
    fail_cloud_hooks "invalid ENSURE_HOOKS_MODE: $MODE (expected best-effort, wait, or require)"
    ;;
esac

AGENT_HOOKS_DIR=""
case "$MODE" in
  wait)
    if is_cursor_cloud; then
      AGENT_HOOKS_DIR=$(wait_for_agent_hooks_dir) || {
        fail_cloud_hooks "Cloud agent-hooks not available after ${ENSURE_HOOKS_WAIT_SECS:-60}s — refusing silent skip"
      }
    else
      AGENT_HOOKS_DIR=$(find_agent_hooks_dir 2>/dev/null) || AGENT_HOOKS_DIR=""
    fi
    ;;
  require)
    if is_cursor_cloud; then
      AGENT_HOOKS_DIR=$(find_agent_hooks_dir) || {
        fail_cloud_hooks "Cloud agent-hooks bridge required but ~/.cursor/agent-hooks dispatcher is missing"
      }
    else
      AGENT_HOOKS_DIR=$(find_agent_hooks_dir 2>/dev/null) || AGENT_HOOKS_DIR=""
    fi
    ;;
  *)
    AGENT_HOOKS_DIR=$(find_agent_hooks_dir 2>/dev/null) || AGENT_HOOKS_DIR=""
    ;;
esac

HOOKS_DIR=$(git config --get core.hooksPath 2>/dev/null || true)

# If agent-hooks exist but core.hooksPath doesn't point to them, restore it.
if [ -n "$AGENT_HOOKS_DIR" ] && [ "$HOOKS_DIR" != "$AGENT_HOOKS_DIR" ]; then
  git config core.hooksPath "$AGENT_HOOKS_DIR"
  HOOKS_DIR="$AGENT_HOOKS_DIR"
  echo "[ensure-hooks] Restored core.hooksPath to $AGENT_HOOKS_DIR"
fi

# Nothing more to do if we're not using agent-hooks.
case "$HOOKS_DIR" in
  *agent-hooks*) ;;
  *)
    if [ "$MODE" = "require" ] && is_cursor_cloud; then
      fail_cloud_hooks "Cloud session requires agent-hooks core.hooksPath but git config has: ${HOOKS_DIR:-<unset>}"
    fi
    exit 0
    ;;
esac

if [ ! -d "$HOOKS_DIR" ] || [ ! -f "$HOOKS_DIR/.dispatcher" ]; then
  if is_cursor_cloud; then
    fail_cloud_hooks "agent-hooks dispatcher missing at $HOOKS_DIR — refusing silent skip"
  fi
  exit 0
fi

BRIDGE_DIR="$HOME/.cursor/husky-bridge"
mkdir -p "$BRIDGE_DIR"

# Resolve the current repo's Husky hook at git-hook time (not install time).
for hook_name in pre-commit pre-push commit-msg; do
  cat >"$BRIDGE_DIR/$hook_name" <<'EOF'
#!/usr/bin/env sh
hook=$(basename "$0")
repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
if [ -x "$repo/.husky/_/$hook" ]; then
  exec "$repo/.husky/_/$hook"
fi
if [ -f "$repo/.husky/$hook" ]; then
  echo "error: Husky hook shim missing or not executable (.husky/_/$hook). Run: npm run prepare" >&2
  exit 1
fi
exit 0
EOF
  chmod +x "$BRIDGE_DIR/$hook_name"
done

ORIG_PATH_FILE="$HOOKS_DIR/.cursor-original-hooks-path"
CURRENT_ORIG=$(cat "$ORIG_PATH_FILE" 2>/dev/null || true)
if [ "$CURRENT_ORIG" != "$BRIDGE_DIR" ]; then
  echo "$BRIDGE_DIR" >"$ORIG_PATH_FILE"
  echo "[ensure-hooks] Updated original hooks path to $BRIDGE_DIR"
fi

# Ensure dispatcher symlinks exist for Husky hooks that have user scripts
for hook_script in "$REPO_ROOT"/.husky/pre-push "$REPO_ROOT"/.husky/pre-commit "$REPO_ROOT"/.husky/commit-msg; do
  if [ -f "$hook_script" ]; then
    hook_name=$(basename "$hook_script")
    target="$HOOKS_DIR/$hook_name"
    if [ ! -e "$target" ] || [ "$(readlink "$target" 2>/dev/null)" != ".dispatcher" ]; then
      ln -sf .dispatcher "$target"
      echo "[ensure-hooks] Created $hook_name hook symlink"
    fi
  fi
done

# Fail closed on Cloud when bridge metadata is still wrong after setup.
if is_cursor_cloud; then
  CURRENT_ORIG=$(cat "$ORIG_PATH_FILE" 2>/dev/null || true)
  if [ "$CURRENT_ORIG" != "$BRIDGE_DIR" ]; then
    fail_cloud_hooks "Cloud agent-hooks bridge not configured (.cursor-original-hooks-path != $BRIDGE_DIR)"
  fi
  for hook_script in "$REPO_ROOT"/.husky/pre-push "$REPO_ROOT"/.husky/pre-commit "$REPO_ROOT"/.husky/commit-msg; do
    if [ -f "$hook_script" ]; then
      hook_name=$(basename "$hook_script")
      target="$HOOKS_DIR/$hook_name"
      if [ ! -e "$target" ] || [ "$(readlink "$target" 2>/dev/null)" != ".dispatcher" ]; then
        fail_cloud_hooks "Cloud agent-hooks missing dispatcher symlink for $hook_name"
      fi
    fi
  done
fi
