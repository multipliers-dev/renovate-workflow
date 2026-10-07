# Versioning

How versions are tracked and released in this repository. The **Cursor plugin** and **npm CLI package** share one repository version — when a release is cut, both channels move together at the same commit.

## Aligned versions

Keep these in sync when bumping in a reviewed PR:

| File | Field | Current |
| --- | --- | --- |
| `package.json` | `"version"` | `0.2.0` |
| `plugin.json` (Agent Plugins 1.0 portable) | `"version"` | `0.2.0` |
| `.cursor-plugin/plugin.json` (Cursor overlay) | `"version"` | `0.2.0` |

The marketplace catalog (`.cursor-plugin/marketplace.json`) has **no version field**. Treat it as install metadata for the GitHub-import flow, not a release artifact.

Root `plugin.json` is the portable [Agent Plugins 1.0](https://agent-plugins.org/specification) manifest (metadata only — skills at fixed `skills/`). `.cursor-plugin/plugin.json` is the Cursor extension overlay (`skills`, `agents` paths). See [adopt.md](adopt.md#portable-vs-cursor-layers-this-repo).

## npm package (in rollout)

| Item | Status |
| --- | --- |
| npm org / scope | **`@multipliers-dev`** — created and controlled by project owner |
| Target publish name | **`@multipliers-dev/renovate-workflow`** (confirmed) |
| First npm version | **`0.3.0`** (after `version-bump-0.3.0` PR merges) |
| Registry publish today | **Not yet** — `"private": true` until the version-bump PR; release workflow is wired but requires scoped manifest + `NPM_TOKEN` |

Plugin manifest `name` fields (`plugin.json`, `.cursor-plugin/plugin.json`) stay **`renovate-workflow`** — only `package.json` uses the scoped npm name after the version-bump slice.

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

For **`0.3.0`**, the same PR also:

- Renames `package.json` `"name"` to `@multipliers-dev/renovate-workflow`
- Removes `"private": true`
- Keeps `scripts/` in `files` until consumer migrations finish (see [npm distribution plan](../.cursor/plans/2026-10-07-npm-package-distribution.plan.md))

### Step B — Publish (manual `workflow_dispatch` only)

After the version-bump PR merges:

1. Configure **`NPM_TOKEN`** as a GitHub Actions repository secret (npm automation token with publish access to `@multipliers-dev/renovate-workflow`). Required before the first release.
2. In GitHub Actions, run **Release** against `main`.
3. Confirm with input `publish X.Y.Z` (exact manifest version).
4. Workflow checks out `main`, runs safeguards, `npm publish --access public` (reads name/version from checked-out `package.json` only — no CLI coordinate override), tags `vX.Y.Z` at the same commit, and creates a GitHub Release.

**Not automated:** publish on merge, version bumps in the release workflow, commits back to `main`, release-please, Changesets, or plugin-only tags without npm.

### Release safeguards (blocking)

| Check | Purpose |
| --- | --- |
| Clean, current `main` | `HEAD` matches `origin/main`; working tree clean |
| Aligned manifests | All three manifest versions match |
| Scoped publish name | `package.json` `"name"` is `@multipliers-dev/renovate-workflow`; not `private` |
| Confirmation input | Dispatcher typed `publish X.Y.Z` matching manifests |
| `npm ci` → test → typecheck → build | Same gates as CI |
| npm version absent | `npm view` for scoped name at manifest version fails |
| git tag absent | `vX.Y.Z` not on remote |
| Packed artifact smoke | `npm pack` + temp install + `renovate-workflow freshness-poll --help` |
| Tag ↔ publish commit | GitHub Release and `vX.Y.Z` tag point at the published commit SHA |

CI also runs `npm publish --dry-run` on every push/PR (see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)).

## Version semantics (pre-1.0)

Remain **`0.x`** until the CLI contract stabilizes.

| Bump | When |
| --- | --- |
| **Patch** | Bug fix in `freshness-poll` output/behavior; dependency patch that does not change CLI contract |
| **Minor** | New subcommand; additive CLI flags; backward-compatible JSON fields |
| **Major** | Rename/remove flags; breaking JSON shape; Node engine floor increase; removing a subcommand |

**Consumer version range after first npm release:** `^0.3.0` (`>=0.3.0 <0.4.0` under npm caret rules for `0.x`).

## Consumer install paths

### Today (git + legacy `tsx` script)

```json
"renovate-workflow": "github:multipliers-dev/renovate-workflow"
```

Pin to a tag for reproducible installs: `github:multipliers-dev/renovate-workflow#v0.2.0`.

### Target (after first npm release + consumer migration)

```json
"@multipliers-dev/renovate-workflow": "^0.3.0"
```

```json
"renovate:freshness-poll": "renovate-workflow freshness-poll"
```

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

This is separate from the package version (`0.2.0` above). The repo targets **Agent Plugins spec 1.0.0** via the root `plugin.json` `$schema` URL:

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
