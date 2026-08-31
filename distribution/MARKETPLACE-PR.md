# Marketplace registration (manual PR)

This VM token cannot push to `multipliers-dev/cursor-team-marketplace`. Open a separate PR with:

## 1. Copy plugin tree

```bash
# From renovate-workflow repo after ./scripts/sync-cursor-plugin.sh
rsync -a distribution/cursor-plugin/ /path/to/cursor-team-marketplace/plugins/renovate-workflow/
```

## 2. Register in `.cursor-plugin/marketplace.json`

Add to the `plugins` array:

```json
{
  "name": "renovate-workflow",
  "source": "renovate-workflow",
  "description": "Portable Renovate classify → investigate → maintainer ladder (skills + agent docs; scripts via npm git dep)"
}
```

Bump `metadata.version` if releasing a new marketplace bundle.

## 3. CI

Existing marketplace CI should cover the new plugin paths; no new workflow required unless lint scope is path-filtered.
