# renovate-workflow (Cursor plugin)

Distribution adapter for the portable Renovate merge ladder. **Canonical source:** [multipliers-dev/renovate-workflow](https://github.com/multipliers-dev/renovate-workflow).

## Skills

| Skill | Invoke | Role |
| --- | --- | --- |
| `renovate-classifier` | `/renovate-classifier` | Classify one Renovate PR; emit execution packet |
| `renovate-maintainer` | `/renovate-maintainer` | Execute packet; merge when gated |
| `renovate-investigator` | `/renovate-investigator` | Investigation lane evidence |
| `renovate-loop` | `/renovate-loop` | Orchestrate classify → execute cycles |
| `renovate-draft-readiness` | `/renovate-draft-readiness` | Parked draft readiness comments |

## Portable vs local

Plugin install provides skills, agent prompts, templates, rubric base, and runbook. Consumer repos still need per-repo config and executable scripts — see [docs/adopt.md](docs/adopt.md) in this plugin (synced from renovate-workflow).

Regenerate this tree from canonical repo: `./scripts/sync-cursor-plugin.sh` in renovate-workflow.
