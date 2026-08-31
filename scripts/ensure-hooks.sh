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

set -e

if ! REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null); then
  exit 0
fi

HOOKS_DIR=$(git config --get core.hooksPath 2>/dev/null || true)

# Cursor Cloud replaces core.hooksPath with its own dispatcher that chains
# to the original hooks. Detect the agent-hooks directory even when
# core.hooksPath has been overwritten (e.g. by `husky` in prepare, which
# sets core.hooksPath = .husky/_).
AGENT_HOOKS_ROOT="$HOME/.cursor/agent-hooks"
AGENT_HOOKS_DIR=""

if [ -d "$AGENT_HOOKS_ROOT" ]; then
  for d in "$AGENT_HOOKS_ROOT"/*/; do
    if [ -f "${d}.dispatcher" ]; then
      AGENT_HOOKS_DIR="${d%/}"
      break
    fi
  done
fi

# If agent-hooks exist but core.hooksPath doesn't point to them, restore it.
if [ -n "$AGENT_HOOKS_DIR" ] && [ "$HOOKS_DIR" != "$AGENT_HOOKS_DIR" ]; then
  git config core.hooksPath "$AGENT_HOOKS_DIR"
  HOOKS_DIR="$AGENT_HOOKS_DIR"
  echo "[ensure-hooks] Restored core.hooksPath to $AGENT_HOOKS_DIR"
fi

# Nothing more to do if we're not using agent-hooks
case "$HOOKS_DIR" in
  *agent-hooks*) ;;
  *) exit 0 ;;
esac

if [ ! -d "$HOOKS_DIR" ] || [ ! -f "$HOOKS_DIR/.dispatcher" ]; then
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
  exec sh "$repo/.husky/$hook"
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
