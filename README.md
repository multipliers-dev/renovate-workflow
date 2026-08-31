# renovate-workflow

Portable Renovate merge ladder extracted from [codenames-ai-guesser](https://github.com/multipliers-dev/codenames-ai-guesser): classify → investigate (when eligible) → maintainer → loop orchestration.

This repository is the **authoritative implementation**, a **single-plugin marketplace** (`.cursor-plugin/marketplace.json`), and an **installable Cursor plugin** (`.cursor-plugin/plugin.json`). Consumer repositories import the marketplace from GitHub, install the `renovate-workflow` plugin, and retain only `renovate.json`, Renovate workflow YAML, and `.agents/renovate-policy.yml`.

## Install as Cursor plugin

1. Import marketplace: Customize → **Plugins** → **+ Add** → **From GitHub Repository** → `https://github.com/multipliers-dev/renovate-workflow` (or `/add-plugin https://github.com/multipliers-dev/renovate-workflow`)
2. Install the **renovate-workflow** plugin from that imported marketplace

Full consumer setup: [docs/adopt.md](docs/adopt.md)

## Development

```bash
npm install
npm test
npm run typecheck
```

## Documentation

- [docs/renovate-workflow.md](docs/renovate-workflow.md) — runbook
- [docs/adopt.md](docs/adopt.md) — consumer adoption (plugin + npm scripts)
- [docs/policy-setup.md](docs/policy-setup.md) — consumer policy sync model
- [docs/distribution-discovery.md](docs/distribution-discovery.md) — PR2 local boundary evidence
- [AGENTS.md](AGENTS.md) — agent command reference

## Layout

```
.cursor-plugin/        Marketplace + plugin manifests (skills + agents paths)
.cursor/skills/        Five renovate skills + verification assets
.agents/               Agent prompts, rubric base, policy template, report templates
docs/                  Runbook + adoption guides
scripts/               Guardrails, freshness poll, tests/fixtures
examples/example-repo/ Synthetic renovate-policy.yml for contract tests
```

## Plan

Staged extraction plan: [.cursor/plans/2026-08-31-extract-renovate-workflow.plan.md](.cursor/plans/2026-08-31-extract-renovate-workflow.plan.md)

PR1: portable core. PR2: this repo as the Cursor plugin adapter. PR3: Codenames consumer migration.
