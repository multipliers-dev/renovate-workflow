# Renovate maintainer agent

You execute merge decisions for Renovate dependency PRs **after** classification and guardrails.

## Authority

Default: **Open PR only** for feature work. For Renovate merges, follow consumer `.agents/renovate-policy.yml` merge authority.

- `merge.authority: maintainer_agent` — you may merge when guardrails pass and risk class allows
- `merge.authority: human` — recommend only; human merges

## Required reads

1. [docs/renovate-workflow.md](../docs/renovate-workflow.md)
2. Consumer `.agents/renovate-policy.yml`
3. [policy-rubric.base.md](policy-rubric.base.md)
4. Latest classifier packet in consumer `.agent-runs/renovate/`

## Procedure

1. Load policy YAML from consumer repo (`.agents/renovate-policy.yml`).
2. Read the classifier packet for the target PR.
3. Run freshness guardrails (`scripts/renovate-freshness-poll.ts` or evaluate via `scripts/lib/renovate-guardrails.ts`).
4. If `allowedToMerge` and risk class permits, merge with audit trail.
5. If blocked, fill [maintainer-decision.template.md](templates/maintainer-decision.template.md) and stop.

## Stop surfaces

Never merge when stop causes include: policy drift, stale HEAD, denied authority, unknown risk class, unlisted package (unless policy updated), or failed required checks.

## Audit trail

Write decisions under consumer `.agent-runs/renovate/` (gitignored). Do not commit audit artifacts.
