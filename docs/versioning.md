# Versioning

How versions are tracked and released in this repository. The **Cursor plugin** and **npm CLI package** share one repository version — when a release is cut, both channels move together at the same commit.

## Aligned versions

Keep these in sync when bumping in a reviewed PR:

| File | Field | Current |
| --- | --- | --- |
| `package.json` | `"version"` | `0.3.0` |
| `plugin.json` (Agent Plugins 1.0 portable) | `"version"` | `0.3.0` |
| `.cursor-plugin/plugin.json` (Cursor overlay) | `"version"` | `0.3.0` |

The marketplace catalog (`.cursor-plugin/marketplace.json`) has **no version field**. Treat it as install metadata for the GitHub-import flow, not a release artifact.

Root `plugin.json` is the portable [Agent Plugins 1.0](https://agent-plugins.org/specification) manifest (metadata only — skills at fixed `skills/`). `.cursor-plugin/plugin.json` is the Cursor extension overlay (`skills`, `agents` paths). See [adopt.md](adopt.md#portable-vs-cursor-layers-this-repo).

## npm package

| Item | Status |
| --- | --- |
| npm org / scope | **`@multipliers-dev`** |
| Published name | **`@multipliers-dev/renovate-workflow`** |
| First npm release | **`0.3.0`** (October 2026) — published via [`release.yml`](../.github/workflows/release.yml) with npm **Trusted Publishing** (OIDC) |
| Registry auth | **OIDC only** — no `NPM_TOKEN` / `NODE_AUTH_TOKEN` for publishing |

Plugin manifest `name` fields (`plugin.json`, `.cursor-plugin/plugin.json`) stay **`renovate-workflow`** — only `package.json` uses the scoped npm name.

## Unified version policy

| Artifact | Distribution | Version meaning |
| --- | --- | --- |
| Cursor plugin | Git tag / marketplace import | Skills, agents, rubric at version *V* |
| npm package | Registry | CLI/runtime contract at version *V* |

**One coherent repository version:** version *V* always refers to the **same commit** for both channels. There is no supported path to cut a git tag / plugin release at *V* without publishing npm *V*. Maintenance may land on `main` without a release; when a release is cut, npm publish + git tag + GitHub Release all reference the same `main` HEAD commit whose manifests already read *V*.

Merging to `main` **never publishes**. Version bumps happen only in reviewed PRs. The [release workflow](../.github/workflows/release.yml) never bumps versions and never commits back to `main`.

## Two-step release model

### Step A — Version bump (reviewed PR)

Consumer-facing changes accumulate on `main` without a release. When ready, open a PR that bumps `package.json`, `plugin.json`, and `.cursor-plugin/plugin.json` to `X.Y.Z` together.

### Step B — Publish (manual `workflow_dispatch` only)

After the version-bump PR merges:

1. In GitHub Actions, run **Release** against `main`.
2. Confirm with input `publish X.Y.Z` (exact manifest version).
3. Workflow checks out `main`, runs safeguards, `npm publish --access public` via OIDC (reads name/version from checked-out `package.json` only — no CLI coordinate override), tags `vX.Y.Z` at the same commit, and creates a GitHub Release.

**Not automated:** publish on merge, version bumps in the release workflow, commits back to `main`, release-please, Changesets, or plugin-only tags without npm.

## Trusted Publishing (OIDC)

The release workflow authenticates with npm via [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) (GitHub Actions OIDC). **Do not** create or store an `NPM_TOKEN` / `NODE_AUTH_TOKEN` for publishing.

### Requirements (official)

| Requirement | This repository |
| --- | --- |
| npm CLI | **≥ 11.5.1** (Trusted Publishing); release workflow uses Node **24** (bundled npm meets this) |
| Node.js | **≥ 22.14.0** per npm docs; release workflow pins **24** |
| GitHub runner | **GitHub-hosted** (`ubuntu-latest`) — self-hosted runners are not supported |
| Workflow permission | `id-token: write` (plus `contents: write` for tag/GitHub Release) |
| `actions/setup-node` | **Do not** set `registry-url` without `NODE_AUTH_TOKEN` — an empty `_authToken` line blocks OIDC ([actions/setup-node#1551](https://github.com/actions/setup-node/issues/1551)) |
| `package.json` `repository.url` | Must match the publishing GitHub repo (case-sensitive): `git+https://github.com/multipliers-dev/renovate-workflow.git` |

### Provenance

When publishing via Trusted Publishing from a **public** GitHub repository to a **public** package, npm **automatically** generates and publishes provenance attestations. **Do not** pass `--provenance` on the publish command — it is on by default for this path. See [Generating provenance statements](https://docs.npmjs.com/generating-provenance-statements) and [Trusted publishing — Automatic provenance generation](https://docs.npmjs.com/trusted-publishers/#automatic-provenance-generation).

After a successful release, verify with `npm audit signatures` in a consumer checkout.

### npm Trusted Publisher settings

Trusted Publisher for this repository is **already configured** for [`release.yml`](../.github/workflows/release.yml). Use these values when verifying or recovering configuration:

**Web UI** — [npmjs.com](https://www.npmjs.com) → **Packages** → `@multipliers-dev/renovate-workflow` → **Settings** → **Trusted publishing** → **GitHub Actions**:

| Field | Value |
| --- | --- |
| Organization or user | `multipliers-dev` |
| Repository | `renovate-workflow` |
| Workflow filename | `release.yml` |
| Environment name | *(leave empty — workflow does not use a GitHub Environment)* |
| Allowed actions | Allow **`npm publish`** (direct publish matches `release.yml`) |

**CLI equivalent** (requires npm ≥ 11.15.0, account 2FA, write access to the package):

```bash
npm trust github @multipliers-dev/renovate-workflow \
  --file release.yml \
  --repository multipliers-dev/renovate-workflow \
  --allow-publish
```

npm does **not** validate the configuration at save time — mismatches surface only at publish time. All fields are case-sensitive; workflow filename is **only** `release.yml` (not `.github/workflows/release.yml`).

Consider **Settings → Publishing access → Require two-factor authentication and disallow tokens** ([npm migration tip](https://docs.npmjs.com/trusted-publishers/#recommended-restrict-token-access-when-using-trusted-publishers)).

### Release safeguards (blocking)

| Check | Purpose |
| --- | --- |
| Clean, current `main` | `HEAD` matches `origin/main`; working tree clean |
| Aligned manifests | All three manifest versions match |
| Scoped publish name | `package.json` `"name"` is `@multipliers-dev/renovate-workflow`; not `private` |
| Confirmation input | Dispatcher typed `publish X.Y.Z` matching manifests |
| `npm ci` → test → typecheck → build | Same gates as CI |
| Release concurrency | Workflow-level `concurrency: release` with `cancel-in-progress: false` — only one release dispatch runs at a time |
| npm version absent | `npm view` returns E404 / not-found for the exact scoped name at manifest version; registry/network/auth errors fail the release (not treated as absence) |
| git tag absent | `vX.Y.Z` not on remote |
| Packed artifact smoke | `npm pack` + temp install + `renovate-workflow freshness-poll --help` |
| Tag ↔ publish commit | GitHub Release and `vX.Y.Z` tag point at the published commit SHA |

CI also runs `npm publish --dry-run` on every push/PR (see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)).

### Partial release recovery

`npm publish` and GitHub Release creation are **not atomic**. If `npm publish` succeeds but tag/GitHub Release creation fails:

1. **Do not republish** — do not re-run the release workflow or attempt another `npm publish` for the same version.
2. **Verify the registry artifact** — confirm `npm view @multipliers-dev/renovate-workflow@X.Y.Z` reports the intended version and matches the release commit you meant to ship (compare against `main` HEAD at dispatch time and the packed tarball from that commit if needed).
3. **Create the missing tag and GitHub Release** at that verified commit:

   ```bash
   gh release create vX.Y.Z \
     --target <publish-commit-sha> \
     --title vX.Y.Z \
     --notes "Published @multipliers-dev/renovate-workflow@X.Y.Z from commit <publish-commit-sha>."
   ```

Forward-fix only — npm does not support unpublish as a routine rollback path.

## First release bootstrap (complete — archived)

The initial `0.3.0` release required a **one-time registry bootstrap** before npm would accept Trusted Publisher configuration for a new scoped package. That bootstrap (disposable `0.0.1` staged tarball, Trusted Publisher setup, OIDC `0.3.0` publish, bootstrap stage cleanup) is **complete**.

**Do not** repeat bootstrap steps for routine `0.3.1+` releases — follow [Step A / Step B](#two-step-release-model) only.

Historical procedure, rationale, and recovery notes: [archive/trusted-publishing-bootstrap-0.3.0.md](archive/trusted-publishing-bootstrap-0.3.0.md)

## Version semantics (pre-1.0)

Remain **`0.x`** until the CLI contract stabilizes.

| Bump | When |
| --- | --- |
| **Patch** | Bug fix in `freshness-poll` output/behavior; dependency patch that does not change CLI contract |
| **Minor** | New subcommand; additive CLI flags; backward-compatible JSON fields |
| **Major** | Rename/remove flags; breaking JSON shape; Node engine floor increase; removing a subcommand |

**Consumer version range:** `^0.3.0` (`>=0.3.0 <0.4.0` under npm caret rules for `0.x`).

## Consumer install paths

### npm (recommended)

```json
"@multipliers-dev/renovate-workflow": "^0.3.0"
```

```json
"renovate:freshness-poll": "renovate-workflow freshness-poll"
```

The published npm tarball ships `dist/` and the compiled CLI only. Git installs are not a supported consumer path for executable helpers — use the npm package above.

See [adopt.md](adopt.md) and [distribution-discovery.md](distribution-discovery.md).

## Package metadata

`package.json` includes `repository`, `bugs`, and `homepage` so git/npm can identify the source. See [examples/adopt-stub/package.json](../examples/adopt-stub/package.json).

## Self-hosting (this repo)

This repository does **not** depend on its own published npm package.

| Context | Invocation |
| --- | --- |
| **This repo (dev/CI)** | `npm run renovate:freshness-poll` → `tsx scripts/renovate-freshness-poll.ts` (source) |
| **Packed-artifact test** | `npm pack` + temp install exercises compiled `bin` |
| **External consumers** | `renovate-workflow freshness-poll` from published package |

## Agent Plugins spec version

This is separate from the package version (`0.3.0` above). The repo targets **Agent Plugins spec 1.0.0** via the root `plugin.json` `$schema` URL:

`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`

### Conformance (blocking, offline)

**Conformance** is enforced offline on every PR by `npm test` via `scripts/validate-plugin-structure.test.ts`. It validates closed portable manifest keys, the declared `$schema`, fixed skill layout, and the Cursor overlay boundary. No network calls.

### Drift (advisory, optional network)

**Drift** detection compares the declared spec version against the latest **published** upstream Agent Plugins spec. It is advisory only and does not change blocking conformance or fail PR CI when a newer spec exists.

Run manually:

```bash
npm run check:agent-plugins-spec-drift -- --json
```

The check outputs a `relationship`:

| `relationship` | Meaning | `driftDetected` |
| --- | --- | --- |
| `behind` | Declared version is older than latest confirmed published upstream | `true` |
| `current` | Declared version matches latest confirmed published upstream | `false` |
| `ahead` | Declared version is newer than discovered published upstream | `false` |

A published upstream version is confirmed only when **both** signals agree:

1. [`specification.md`](https://agent-plugins.org/specification.md) reports `Status: Published` and a `Spec Version`
2. `https://agent-plugins.org/schemas/{version}/plugin.schema.json` returns HTTP **200**, and its document `$id` reports the same version

If those signals disagree (for example markdown says `1.1.0` Published but the schema URL 404s), the check fails as an upstream/check error — it does **not** report `behind`, `current`, or `ahead`.

Draft specs in the upstream GitHub repo (for example `1.1.0` before publication on agent-plugins.org) are ignored until both published signals confirm on agent-plugins.org.

The scheduled workflow [`.github/workflows/agent-plugins-spec-drift.yml`](../.github/workflows/agent-plugins-spec-drift.yml) runs weekly:

- `behind` → create or update a single deduplicated GitHub issue (assign maintainer on create)
- `current` → close any open drift issue
- `ahead` → workflow warning only (no issue create/update/close)

Upgrading to a newer Agent Plugins spec is **manual reviewed migration** — never automatic `$schema` bumps or migration PRs. See the archived [Agent Plugins 1.0 migration plan](../.cursor/plans/archive/2026-09-14-agent-plugins-1.0-migration.plan.md) for the prior migration pattern.
