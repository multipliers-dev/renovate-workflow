# Agent instructions

Portable Renovate merge ladder — authoritative implementation for skills, agents, scripts, and policy interpretation.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run TypeScript with reload (`tsx watch src/index.ts`) |
| `npm start` | Run TypeScript once (`tsx src/index.ts`) |
| `npm test` | Vitest — scripts/lib fixtures and guardrails |
| `npm run typecheck` | TypeScript `tsc --noEmit` (root + scripts) |
| `npx tsx scripts/renovate-freshness-poll.ts --help` | Freshness poll CLI (see skill) |

## Renovate workflow

- Runbook: [docs/renovate-workflow.md](docs/renovate-workflow.md)
- Policy sync model: [docs/policy-setup.md](docs/policy-setup.md)
- Portable rubric: [.agents/policy-rubric.base.md](.agents/policy-rubric.base.md)
- Consumer template: [.agents/renovate-policy.template.yml](.agents/renovate-policy.template.yml)
- Synthetic example: [examples/example-repo/renovate-policy.yml](examples/example-repo/renovate-policy.yml)

## Skills

| Skill | Path |
| --- | --- |
| Classifier | `.cursor/skills/renovate-classifier/` |
| Review | `.cursor/skills/review-renovate/` |
| Maintainer | `.cursor/skills/renovate-maintainer/` |
| Freshness | `.cursor/skills/renovate-freshness/` |
| Investigator | `.cursor/skills/renovate-investigator/` |

## Discipline

- Pre-commit runs `npm test` and `npm run typecheck`; do not bypass hooks.
- Generalization removes repository-specific assumptions, not ladder semantics.
- No distribution tooling or install scripts in PR1 scope.
- Commit in small, logical steps with clear messages.
