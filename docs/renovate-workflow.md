# Renovate workflow runbook

Portable merge ladder for Renovate dependency PRs. **Authoritative implementation** lives in this repository.

## Architecture

```
Renovate bot (consumer renovate.json + workflow)
        ↓
renovate-classifier → packet (.agent-runs/renovate/)
        ↓
review-renovate (review_manually lane)
        ↓
renovate-maintainer + guardrails
        ↓
merge or stop → renovate-investigator (investigate lane)
```

## Consumer vs portable ownership

| Consumer repo retains | This repo owns |
| --- | --- |
| `renovate.json` | Skills, agents, runbook |
| `.github/workflows/renovate.yml` | Scripts + guardrails |
| `.agents/renovate-policy.yml` | Policy template + rubric base |
| `.agent-runs/renovate/` (gitignored) | Tests + fixtures |

See [policy-setup.md](policy-setup.md) for the sync model.

## Repo identity

Resolve owner/name from git remote when consumer policy omits them:

```bash
git remote get-url origin
# https://github.com/<owner>/<repo>.git
```

Library: `scripts/lib/renovate-repo.ts`

## Deployment modes

Configured in consumer `.agents/renovate-policy.yml` → `deployment.mode`:

| Mode | Description |
| --- | --- |
| `pat_branch` | Personal Access Token; Renovate uses `renovate/` branch prefix |
| `github_app` | GitHub App installation; workflow mints short-lived tokens |

## CI and checks

Required gates come from consumer policy `checks.required` — not hardcoded in this runbook. Each check names a workflow file (e.g. `ci.yml`) or a command (e.g. `npm run typecheck`). Classifier packets must record status for each required name.

## Skills

| Skill | Role |
| --- | --- |
| [renovate-classifier](../.cursor/skills/renovate-classifier/SKILL.md) | Classify PR → packet |
| [review-renovate](../.cursor/skills/review-renovate/SKILL.md) | Evidence loop for manual review |
| [renovate-maintainer](../.cursor/skills/renovate-maintainer/SKILL.md) | Merge executor |
| [renovate-freshness](../.cursor/skills/renovate-freshness/SKILL.md) | Stale packet detection |
| [renovate-investigator](../.cursor/skills/renovate-investigator/SKILL.md) | Unlisted / ambiguous packages |

## Agents

- [.agents/renovate-maintainer.md](../.agents/renovate-maintainer.md)
- [.agents/renovate-investigator.md](../.agents/renovate-investigator.md)

## Deterministic guardrails

`scripts/lib/derive-stop-causes.ts` enforces:

- Policy version drift
- Stale HEAD SHA
- Merge authority
- Unknown risk class
- Unlisted package
- Required check missing/failed

Run tests: `npm test`

## Freshness poll

```bash
npx tsx scripts/renovate-freshness-poll.ts \
  --policy .agents/renovate-policy.yml \
  --runs .agent-runs/renovate/
```

## Synthetic example

Policy-only example (no Codenames parity in PR1): [examples/example-repo/renovate-policy.yml](../examples/example-repo/renovate-policy.yml)

## Out of scope (this repo)

- Install / vendoring scripts (PR2 distribution)
- Cursor Team Marketplace plugin packaging (PR2)
- Consumer migration (PR3)
