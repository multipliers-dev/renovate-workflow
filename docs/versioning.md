# Versioning

How versions are tracked in this repository. **This repo is not published to npm** and does not cut GitHub releases automatically.

## Aligned versions

Keep these in sync when bumping:

| File | Field | Current |
| --- | --- | --- |
| `package.json` | `"version"` | `0.1.0` |
| `.cursor-plugin/plugin.json` | `"version"` | `0.1.0` |

The marketplace catalog (`.cursor-plugin/marketplace.json`) has **no version field**. Treat it as install metadata for the GitHub-import flow, not a release artifact.

## Consumer git dependency

This package stays `"private": true` — consumers install via git, not the npm registry.

**Today (tracks `main`):**

```json
"renovate-workflow": "github:multipliers-dev/renovate-workflow"
```

**After a human tags `v0.1.0` (optional, not done in this repo automatically):**

```json
"renovate-workflow": "github:multipliers-dev/renovate-workflow#v0.1.0"
```

Pin to a tag for reproducible consumer installs; track `main` for latest fixes.

## Package metadata

`package.json` includes `repository`, `bugs`, and `homepage` so git/npm can identify the source. See [examples/adopt-stub/package.json](../examples/adopt-stub/package.json).

## What we do not do (unless explicitly requested)

- `npm publish`
- `gh release create`
- Git tags or releases as part of routine PRs

Version bumps in this repo are documentation and manifest alignment only until a maintainer chooses to tag.
