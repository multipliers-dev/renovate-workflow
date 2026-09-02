# Agent instructions

Portable Renovate merge ladder — authoritative implementation for consumer repositories.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run TypeScript with reload (`tsx watch src/index.ts`) |
| `npm start` | Run TypeScript once (`tsx src/index.ts`) |
| `npm test` | Vitest — guardrails, stop-causes, investigation eligibility, freshness poll |
| `npm run typecheck` | TypeScript `tsc --noEmit` (root + scripts) |
| `npm run verify:git-hooks` | Confirm Husky shims are runnable in this checkout |
| `npx tsx scripts/renovate-freshness-poll.ts --help` | Freshness poll CLI (babysit helper) |

## Renovate workflow

- Runbook: [docs/renovate-workflow.md](docs/renovate-workflow.md)
- Policy sync model: [docs/policy-setup.md](docs/policy-setup.md)
- Portable rubric: [.agents/policy-rubric.base.md](.agents/policy-rubric.base.md)
- Consumer template: [.agents/renovate-policy.template.yml](.agents/renovate-policy.template.yml)
- Synthetic example (tests): [examples/example-repo/renovate-policy.yml](examples/example-repo/renovate-policy.yml)

## Skills

| Skill | Path |
| --- | --- |
| Classifier | `.cursor/skills/renovate-classifier/` |
| Loop | `.cursor/skills/renovate-loop/` |
| Investigator | `.cursor/skills/renovate-investigator/` |
| Maintainer | `.cursor/skills/renovate-maintainer/` |
| Draft readiness | `.cursor/skills/renovate-draft-readiness/` |

## Agents

| Agent | Path |
| --- | --- |
| Maintainer | `.agents/renovate-maintainer.md` |
| Investigator | `.agents/renovate-investigator.md` |

## Git hooks

Do not blur hook infrastructure with commit checks or CI.

| Layer | Question | Mechanism |
| --- | --- | --- |
| **1 — Hook availability** | Are Git hooks wired and runnable in *this* checkout? | `prepare-git-hooks.sh`, `verify-git-hooks.sh`, `ensure-hooks.sh`, `husky-shim-repair.sh`; `sessionStart` verify/repair/warn |
| **2a — Agent feedback** | Not used | No Prettier / `afterFileEdit` |
| **2b — Commit correctness** | What must pass before a commit lands locally? | `.husky/pre-commit`: `npm test` then `npm run typecheck` |
| **3 — Authoritative enforcement** | Backstop when local/agent machinery fails? | CI (`npm test`, `npm run typecheck`) |

An agent must not assume Git hooks are active merely because `core.hooksPath` is configured. After `git worktree add`, run `npm run prepare` (or `npm run verify:git-hooks` after prepare) in the new worktree before committing.

Cloud Agents: committed `.cursor/environment.json` runs `npm ci` (triggers `prepare`) then `sh scripts/ensure-hooks.sh`. Marketplace / plugin install does not wire this by itself. After merging lifecycle changes, trigger and promote a new environment Build.

## Discipline

- Pre-commit runs `npm test` and `npm run typecheck`; do not bypass hooks.
- Generalization removes repository-specific assumptions, not ladder semantics.
- Commit in small, logical steps with clear messages.
