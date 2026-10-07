# Trusted Publishing bootstrap (0.3.0 first release) — archived

> **Historical / recovery only.** The initial `@multipliers-dev/renovate-workflow@0.3.0` release and npm Trusted Publisher configuration for [`release.yml`](../../.github/workflows/release.yml) are **complete** (October 2026). Normal releases follow [versioning.md](../versioning.md) — version bump PR, then manual `workflow_dispatch` with `publish X.Y.Z`. **Do not** repeat this bootstrap for routine releases.

This document preserves the one-time procedure and rationale for creating a scoped npm package **before** Trusted Publishing could be attached, without occupying the `0.3.0` semver slot.

## Why bootstrap existed

npm requires a package to **already exist on the registry** before a Trusted Publisher can be attached:

- [Trusted publishing](https://docs.npmjs.com/trusted-publishers/) — configure via package settings on npmjs.com (package must exist).
- [`npm trust` prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/) — “Package must exist: The package you're configuring must already exist on the npm registry.”

Therefore **`0.3.0` could be the first OIDC-published version**, but only after a **one-time bootstrap** created the package name on npm without occupying the `0.3.0` semver slot in the staging index.

### Staged vs direct publish (same version)

Per [`npm stage` key behaviors](https://docs.npmjs.com/cli/v12/commands/npm-stage/):

- **Staged and published versions share one semver uniqueness index** — you **cannot** `npm publish` a version that already exists as a **staged** version for that package.
- **Other versions can still publish** while unrelated staged versions are pending.
- **Direct `npm publish` does not supersede** a pending staged submission for the same version.
- To free a semver slot occupied by staging, run **`npm stage reject <stage-id>`** (requires account 2FA) before direct publish.

**Implication for bootstrap:** running `npm stage publish` from a checkout whose `package.json` reads **`0.3.0`** stages **`0.3.0`** and **blocks** the OIDC `release.yml` publish of `0.3.0` until that staged submission is rejected. Leaving it pending is **not** sufficient.

## Bootstrap path used (Option A — staged placeholder)

Uses [staged publishing](https://docs.npmjs.com/staged-publishing): staging a **new** scoped package also creates a public `0.0.0-stage` placeholder so the package exists on npm. `npm stage publish` does **not** require 2FA.

Stage a **bootstrap version other than `0.3.0`** so the `0.3.0` semver slot stays free for `release.yml`. The `0.0.1` version exists **only** in a disposable bootstrap artifact — never in the canonical checkout.

### Why not mutate the checkout?

`npm stage publish` from a directory runs the same pack path as `npm publish` (`libnpmpack`), which invokes `prepack` → `npm test`. This repository enforces release invariants at `0.3.0` (`validate-plugin-structure`, `pack-manifest` tests). Changing `package.json` to `0.0.1` in the checkout therefore fails safely before any registry mutation. Do **not** weaken those tests or use `--ignore-scripts` to evade them.

### `npm stage publish` package-spec

Per [`npm stage publish`](https://docs.npmjs.com/cli/v12/commands/npm-stage/#npm-stage-publish), the command accepts a `<package-spec>` like `npm publish` — a **directory** or a **`.tgz` tarball**. Directory publishes run lifecycle scripts (`prepublishOnly`, then `prepack` during pack). **Tarball publishes do not run lifecycle scripts** (same rule as [`npm publish`](https://docs.npmjs.com/cli/v12/commands/npm-publish/)). For bootstrap, build and validate the real `0.3.0` artifact in the checkout, then stage a **disposable `0.0.1` tarball** repacked with **`npm pack`** (not manual `tar -czf`).

### Why not `tar -czf` for the bootstrap tarball?

`npm pack` (libnpmpack) emits **file entries only** under `package/...` — it never writes a bare `package/` directory entry. macOS/BSD `tar -czf … package` **does** emit `package/` (path ending in `/`). The npm registry rejects such entries with **`E415 Unsupported Media Type` / `invalid path: package/`**. Manual tar on macOS can also introduce AppleDouble `._*` entries; those are a separate artifact-integrity problem, not the direct cause of `invalid path: package/`, but still forbidden in bootstrap tarballs. Use `npm run bootstrap:tarball` (or `tsx scripts/bootstrap-tarball.ts`) to build and preflight-inspect the disposable tarball before any registry operation.

### npm CLI preflight

Staged publishing requires **npm CLI ≥ 11.15.0** ([staged publishing docs](https://docs.npmjs.com/staged-publishing/)). A new enough Node does not guarantee `npm stage` exists (bundled npm may be older). Run before bootstrap:

```bash
sh scripts/npm-stage-cli-preflight.sh
```

The script checks `npm --version` against `11.15.0` and verifies `npm stage --help` succeeds.

## Bootstrap procedure (one-time, completed)

From a clean checkout of the merged `0.3.0` commit on `main` (Node **≥ 22.14.0**, npm preflight above):

```bash
set -euo pipefail

sh scripts/npm-stage-cli-preflight.sh

# --- 1. Validate canonical checkout at 0.3.0 (unchanged throughout) ---
test -z "$(git status --porcelain)" || { echo "working tree not clean" >&2; exit 1; }
node -e 'const p=require("./package.json"); if (p.version !== "0.3.0") { console.error(`Expected package version 0.3.0, got ${p.version}`); process.exit(1) }'

npm ci
npm test
npm run typecheck
npm run build

# --- 2. Pack verified 0.3.0 publish artifact (prepack re-runs build + test) ---
PACK_OUTPUT="$(npm pack 2>/dev/null)"
TARBALL="$(printf '%s\n' "$PACK_OUTPUT" | grep '\.tgz$' | tail -1)"
test -n "$TARBALL" && test -f "$TARBALL" || { echo "npm pack did not produce a .tgz" >&2; exit 1; }
trap 'rm -f "${TARBALL:-}"; if [ -n "${BOOTSTRAP_TGZ:-}" ]; then rm -rf "$(dirname "$BOOTSTRAP_TGZ")"; fi' EXIT

# --- 3. Disposable bootstrap tarball at 0.0.1 (npm pack in isolated temp dir) ---
BOOTSTRAP_TGZ="$(npm run bootstrap:tarball -- --from-tarball "$TARBALL" | tail -1)"
test -n "$BOOTSTRAP_TGZ" && test -f "$BOOTSTRAP_TGZ" || { echo "bootstrap tarball preflight failed" >&2; exit 1; }

# --- 4. Stage disposable 0.0.1 tarball (no lifecycle scripts on tarball publish) ---
npm stage publish "$BOOTSTRAP_TGZ" --access public

# --- 5. Confirm canonical checkout still 0.3.0 and clean ---
test -z "$(git status --porcelain)" || { echo "bootstrap must not modify the checkout" >&2; exit 1; }
node -e 'const p=require("./package.json"); if (p.version !== "0.3.0") { console.error(`Expected package version to remain 0.3.0, got ${p.version}`); process.exit(1) }'

npm stage list @multipliers-dev/renovate-workflow
```

**Do not** approve the staged `0.0.1` submission. A pending `0.0.1` does **not** block OIDC publish of `0.3.0`. The registry now has the package shell (`0.0.0-stage` placeholder).

### Trusted Publisher configuration (completed)

Configured via package **Settings → Trusted publishing → GitHub Actions**:

| Field | Value |
| --- | --- |
| Organization or user | `multipliers-dev` |
| Repository | `renovate-workflow` |
| Workflow filename | `release.yml` |
| Environment name | *(empty — workflow does not use a GitHub Environment)* |
| Allowed actions | Allow **`npm publish`** |

CLI equivalent (requires npm ≥ 11.15.0, account 2FA, write access to the package):

```bash
npm trust github @multipliers-dev/renovate-workflow \
  --file release.yml \
  --repository multipliers-dev/renovate-workflow \
  --allow-publish
```

Trusted Publisher configurations must be validated within **48 hours** of creation ([npm docs](https://docs.npmjs.com/trusted-publishers/#trusted-publisher-configuration-expiry)).

### First OIDC release and cleanup (completed)

1. Dispatched `release.yml` with confirmation `publish 0.3.0` — OIDC published `@multipliers-dev/renovate-workflow@0.3.0`.
2. Rejected the disposable bootstrap stage:

   ```bash
   npm stage list @multipliers-dev/renovate-workflow   # find the pending 0.0.1 stage id
   npm stage reject <stage-id>                         # requires account 2FA
   ```

## Alternate paths (not used)

### Option A′ — Staged `0.3.0`, then explicit reject

If `npm stage publish` was already run with `version: 0.3.0` in `package.json`:

1. `npm stage list @multipliers-dev/renovate-workflow` — note the staged `0.3.0` stage id.
2. `npm stage reject <stage-id>` — **required** before OIDC publish; requires account 2FA.
3. Configure Trusted Publisher, then dispatch `release.yml` for `0.3.0`.

### Option B — One-time interactive `npm publish`

From [Creating and publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages): the first direct publish requires **account 2FA**.

1. Maintainer runs locally at the merged commit: `npm ci && npm test && npm run typecheck && npm run build && npm publish --access public`
2. Configure Trusted Publishing for **future** releases (`0.3.1+`).
3. **Do not** re-dispatch `release.yml` for `0.3.0` — create the git tag and GitHub Release manually if needed.

Option A preserved `0.3.0` as the first version published through `release.yml` with OIDC.

## Recovery scenarios

- **Re-bootstrap after accidental package deletion** — only if the scoped package no longer exists on npm; otherwise follow normal [versioning.md](../versioning.md) releases.
- **Pending staged version blocks OIDC publish** — `npm stage list` + `npm stage reject <stage-id>` before dispatching `release.yml` for the same semver.
- **Trusted Publisher misconfiguration** — verify fields in [versioning.md § npm Trusted Publisher settings](../versioning.md#npm-trusted-publisher-settings); npm does not validate at save time.
