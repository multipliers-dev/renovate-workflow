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
