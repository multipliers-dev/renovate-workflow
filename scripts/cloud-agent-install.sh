#!/usr/bin/env sh
# Portable Cloud Agent install (team-harness marketplace primitive).
# When .nvmrc pins a newer Node major than PATH, extract the full official Node
# distribution prefix (bin + lib/node_modules + symlinks) into /usr/local, persist
# session PATH, then run the declared dependency command.
#
# Contract: require CLOUD_AGENT_INSTALL_CMD or accept the command as arguments.
# Fail clearly if absent. Do not infer npm/pnpm/workspace layout.
# Read .nvmrc major pin only — do not parse package.json engines.node ranges.
# Do not rewrite /usr/bin/node or Cursor exec-daemon binaries.

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
# shellcheck source=/dev/null
. "$SCRIPT_DIR/cloud-agent-session-path.sh"

MARKER="team-harness-cloud-node-path"
PROFILE_SNIPPET="/etc/profile.d/${MARKER}.sh"

read_nvmrc_major() {
  if [ ! -f .nvmrc ]; then
    return 1
  fi
  _line=$(grep -v '^[[:space:]]*#' .nvmrc | grep -v '^[[:space:]]*$' | head -1 | tr -d '[:space:]')
  if [ -z "$_line" ]; then
    return 1
  fi
  _major=$(printf '%s' "$_line" | sed 's/^v//' | cut -d. -f1)
  case "$_major" in
    '' | *[!0-9]*)
      echo "error: .nvmrc must pin a Node major version (got: ${_line})" >&2
      exit 1
      ;;
  esac
  printf '%s' "$_major"
}

current_node_major() {
  if ! command -v node >/dev/null 2>&1; then
    printf ''
    return 0
  fi
  node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1
}

latest_node_version_for_major() {
  _major=$1
  _version=$(
    curl -fsSL https://nodejs.org/dist/index.json |
      grep -oE "\"version\": ?\"v${_major}\.[0-9]+\.[0-9]+\"" |
      head -1 |
      sed -E 's/.*"(v[^"]+)".*/\1/'
  )
  if [ -z "$_version" ]; then
    echo "error: no Node release found for major ${_major}" >&2
    exit 1
  fi
  printf '%s' "$_version"
}

node_platform() {
  _arch=$(uname -m)
  case "$_arch" in
    x86_64 | amd64) printf 'linux-x64' ;;
    aarch64 | arm64) printf 'linux-arm64' ;;
    *)
      echo "error: unsupported architecture for Node install: ${_arch}" >&2
      exit 1
      ;;
  esac
}

install_node_major() {
  _major=$1
  _prefix=${CLOUD_AGENT_NODE_PREFIX:-/usr/local}
  _version=$(latest_node_version_for_major "$_major")
  _platform=$(node_platform)
  _dir="node-${_version}-${_platform}"
  _tarball="${_dir}.tar.xz"
  _url="https://nodejs.org/dist/${_version}/${_tarball}"
  _tmpdir=$(mktemp -d)
  _extracted="${_tmpdir}/${_dir}"

  echo "[${MARKER}] Installing Node ${_version} into ${_prefix} (major pin ${_major})"
  curl -fsSL "$_url" | tar -xJ -C "$_tmpdir"
  if [ ! -d "$_extracted" ]; then
    echo "error: expected extracted Node directory ${_extracted}" >&2
    rm -rf "$_tmpdir"
    exit 1
  fi
  install -d "$_prefix"
  # Merge the full distribution tree (bin symlinks + lib/node_modules/npm, etc.).
  cp -a "$_extracted/." "$_prefix/"
  rm -rf "$_tmpdir"
}

persist_session_path() {
  _prefix=${CLOUD_AGENT_NODE_PREFIX:-/usr/local}
  _profile_line="case \":\${PATH}:\" in *:${_prefix}/bin:*) ;; *) export PATH=\"${_prefix}/bin:\${PATH}\" ;; esac"

  if [ -w /etc/profile.d ] 2>/dev/null; then
    printf '%s\n' "# ${MARKER}" "$_profile_line" >"$PROFILE_SNIPPET"
    chmod 644 "$PROFILE_SNIPPET" 2>/dev/null || true
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    printf '%s\n' "# ${MARKER}" "$_profile_line" | sudo tee "$PROFILE_SNIPPET" >/dev/null
    sudo chmod 644 "$PROFILE_SNIPPET" 2>/dev/null || true
  fi

  for _rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    if [ -f "$_rc" ] && grep -q "$MARKER" "$_rc" 2>/dev/null; then
      continue
    fi
    {
      printf '\n# %s\n' "$MARKER"
      printf '%s\n' "$_profile_line"
    } >>"$_rc"
  done
}

maybe_install_node_from_nvmrc() {
  if ! _target_major=$(read_nvmrc_major); then
    return 0
  fi
  _current_major=$(current_node_major)
  if [ "$_current_major" = "$_target_major" ]; then
    echo "[${MARKER}] Node major ${_target_major} already on PATH"
    return 0
  fi
  install_node_major "$_target_major"
  persist_session_path
  # shellcheck source=/dev/null
  . "$SCRIPT_DIR/cloud-agent-session-path.sh"
}

run_declared_install() {
  if [ "$#" -gt 0 ]; then
    echo "[${MARKER}] Running install command: $*"
    exec "$@"
  fi
  if [ -n "${CLOUD_AGENT_INSTALL_CMD:-}" ]; then
    echo "[${MARKER}] Running CLOUD_AGENT_INSTALL_CMD"
    exec sh -c "$CLOUD_AGENT_INSTALL_CMD"
  fi
  echo "error: dependency install command required (set CLOUD_AGENT_INSTALL_CMD or pass command as arguments)" >&2
  exit 1
}

maybe_install_node_from_nvmrc
run_declared_install "$@"
