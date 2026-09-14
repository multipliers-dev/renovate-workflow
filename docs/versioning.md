# Versioning

How versions are tracked in this repository. **This repo is not published to npm** and does not cut GitHub releases automatically.

## Aligned versions

Keep these in sync when bumping:

| File | Field | Current |
| --- | --- | --- |
| `package.json` | `"version"` | `0.2.0` |
| `plugin.json` (Agent Plugins 1.0 portable) | `"version"` | `0.2.0` |
| `.cursor-plugin/plugin.json` (Cursor overlay) | `"version"` | `0.2.0` |

The marketplace catalog (`.cursor-plugin/marketplace.json`) has **no version field**. Treat it as install metadata for the GitHub-import flow, not a release artifact.

Root `plugin.json` is the portable [Agent Plugins 1.0](https://agent-plugins.org/specification) manifest (metadata only — skills at fixed `skills/`). `.cursor-plugin/plugin.json` is the Cursor extension overlay (`skills`, `agents` paths). See [adopt.md](adopt.md#portable-vs-cursor-layers-this-repo).

## Consumer git dependency

This package stays `"private": true` — consumers install via git, not the npm registry.

**Today (tracks `main`):**

```json
"renovate-workflow": "github:multipliers-dev/renovate-workflow"
```

**After a human tags `v0.2.0` (optional, not done in this repo automatically):**

```json
"renovate-workflow": "github:multipliers-dev/renovate-workflow#v0.2.0"
```

Pin to a tag for reproducible consumer installs; track `main` for latest fixes.

## Package metadata

`package.json` includes `repository`, `bugs`, and `homepage` so git/npm can identify the source. See [examples/adopt-stub/package.json](../examples/adopt-stub/package.json).

## What we do not do (unless explicitly requested)

- `npm publish`
- `gh release create`
- Git tags or releases as part of routine PRs

Version bumps in this repo are documentation and manifest alignment only until a maintainer chooses to tag.

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
2. `https://agent-plugins.org/schemas/{version}/plugin.schema.json` returns HTTP **200**

If those signals disagree (for example markdown says `1.1.0` Published but the schema URL 404s), the check fails as an upstream/check error — it does **not** report `behind`, `current`, or `ahead`.

Draft specs in the upstream GitHub repo (for example `1.1.0` before publication on agent-plugins.org) are ignored until both published signals confirm on agent-plugins.org.

The scheduled workflow [`.github/workflows/agent-plugins-spec-drift.yml`](../.github/workflows/agent-plugins-spec-drift.yml) runs weekly:

- `behind` → create or update a single deduplicated GitHub issue (assign maintainer on create)
- `current` → close any open drift issue
- `ahead` → workflow warning only (no issue create/update/close)

Upgrading to a newer Agent Plugins spec is **manual reviewed migration** — never automatic `$schema` bumps or migration PRs. See the archived [Agent Plugins 1.0 migration plan](../.cursor/plans/archive/2026-09-14-agent-plugins-1.0-migration.plan.md) for the prior migration pattern.
