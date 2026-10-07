#!/usr/bin/env sh
# Maintainer preflight: npm stage requires CLI >= 11.15.0 (staged publishing).
# Node version alone does not guarantee npm stage exists — bundled npm may be older.
set -eu

NPM_MIN="11.15.0"
NPM_VERSION="$(npm --version)"

if [ "$(printf '%s\n' "$NPM_MIN" "$NPM_VERSION" | sort -V | head -1)" != "$NPM_MIN" ]; then
  echo "npm >= ${NPM_MIN} required for npm stage (got ${NPM_VERSION}). Upgrade npm, not just Node." >&2
  echo "Example: npm install -g npm@${NPM_MIN}" >&2
  exit 1
fi

if ! npm stage --help >/dev/null 2>&1; then
  echo "npm stage command not available (npm ${NPM_VERSION}). Install npm >= ${NPM_MIN}." >&2
  exit 1
fi

echo "npm stage CLI preflight OK (npm ${NPM_VERSION} >= ${NPM_MIN})"
