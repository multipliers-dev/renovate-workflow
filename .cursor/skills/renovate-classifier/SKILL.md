---
name: renovate-classifier
description: Classify Renovate dependency PRs into policy buckets and emit structured classifier packets for the merge ladder.
---

# Renovate classifier

Classify a Renovate PR using consumer `.agents/renovate-policy.yml` and portable [policy-rubric.base.md](../../.agents/policy-rubric.base.md).

## When to use

- New Renovate PR opened or updated
- Re-classification after policy change
- Dry-run verification of ladder semantics

## Inputs

- PR metadata (number, head/base SHA, changed package)
- Consumer `.agents/renovate-policy.yml`
- Required check statuses from consumer policy `checks.required`

## Outputs

- JSON packet per [packet-schema.md](packet-schema.md)
- Saved under consumer `.agent-runs/renovate/` (gitignored)

## Procedure

1. Resolve repo identity (git remote or policy `repo.owner` / `repo.name`).
2. Load policy; derive classification (unlisted from absence).
3. Map classification → risk class via rubric base.
4. Record each required check status by name.
5. Set `merge_authority` from policy.
6. Validate packet schema; write JSON artifact.

## Cross-links

- Runbook: [docs/renovate-workflow.md](../../docs/renovate-workflow.md)
- Rubric: [.agents/policy-rubric.base.md](../../.agents/policy-rubric.base.md)
- Template: [.agents/templates/classifier-packet.template.json](../../.agents/templates/classifier-packet.template.json)
- Guardrails: [scripts/lib/renovate-guardrails.ts](../../scripts/lib/renovate-guardrails.ts)

## Verification

See [verification.md](verification.md).
