# Agent instructions

Greenfield repo — universal execution and verification only. Architecture and product choices are yours to make for the task at hand.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run TypeScript with reload (`tsx watch src/index.ts`) |
| `npm start` | Run TypeScript once (`tsx src/index.ts`) |
| `npm test` | Vitest (`--passWithNoTests` — green with zero tests) |
| `npm run typecheck` | TypeScript `tsc --noEmit` |

## Discipline

- Pre-commit runs `npm test` and `npm run typecheck`; do not bypass hooks.
- Keep changes focused; do not add product scaffolding (frameworks, databases, deploy pipelines) unless the task requires it.
- Commit in small, logical steps with clear messages.
