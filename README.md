# renovate-workflow

Portable Renovate merge ladder extracted from [codenames-ai-guesser](https://github.com/multipliers-dev/codenames-ai-guesser): classify → investigate (when eligible) → maintainer → loop orchestration.

This repository is the **authoritative implementation** (skills, agents, scripts, runbook, policy rubric base). Consumer repositories retain only `renovate.json`, Renovate workflow YAML, and `.agents/renovate-policy.yml`.

## Quick start

```bash
npm install
npm test
npm run typecheck
```

## Documentation

- [docs/renovate-workflow.md](docs/renovate-workflow.md) — runbook
- [docs/policy-setup.md](docs/policy-setup.md) — consumer policy sync model
- [AGENTS.md](AGENTS.md) — agent command reference

## Layout

```
docs/                  Runbook + policy setup
.cursor/skills/        Five renovate skills + verification assets
.agents/               Agent prompts, rubric base, policy template, report templates
scripts/               Guardrails, freshness poll, tests/fixtures (92 tests)
examples/example-repo/ Synthetic renovate-policy.yml for contract tests
```

## Plan

Staged extraction plan: [.cursor/plans/2026-08-31-extract-renovate-workflow.plan.md](.cursor/plans/2026-08-31-extract-renovate-workflow.plan.md)

PR1 delivers portable core. Distribution (PR2) and Codenames consumer migration (PR3) follow after merge.
