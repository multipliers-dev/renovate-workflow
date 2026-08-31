---
name: renovate-maintainer
description: Operate the merge ladder for Renovate PRs with deterministic guardrails and audit trail.
---

# Renovate maintainer

Merge executor skill paired with [.agents/renovate-maintainer.md](../../.agents/renovate-maintainer.md).

## When to use

- Classifier packet exists and checks are green
- Batch merge window for `low_risk_tooling`
- Human delegated merge to maintainer agent

## Procedure

1. Load consumer policy + latest packet.
2. Evaluate guardrails (`scripts/lib/renovate-guardrails.ts`).
3. Run freshness poll if HEAD may have moved (`scripts/renovate-freshness-poll.ts`).
4. Merge or stop with documented causes.
5. Write [maintainer-decision.template.md](../../.agents/templates/maintainer-decision.template.md) on stop.

## Cross-links

- Agent: [.agents/renovate-maintainer.md](../../.agents/renovate-maintainer.md)
- Runbook: [docs/renovate-workflow.md](../../docs/renovate-workflow.md)
- Investigator: [renovate-investigator/SKILL.md](../renovate-investigator/SKILL.md)

## Verification

See [verification.md](verification.md).
