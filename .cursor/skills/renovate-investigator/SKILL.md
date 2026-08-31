---
name: renovate-investigator
description: Investigate unlisted or ambiguous Renovate PRs and recommend policy updates or rejection.
---

# Renovate investigator

Investigation lane for `investigate` risk class and `unlisted_package` classifications.

## When to use

- Classifier emitted `investigate`
- Maintainer escalated unknown package
- Policy gap suspected

## Procedure

1. Confirm unlisted derivation (package absent from all policy lists).
2. Map usage across `repo.workspace_roots`.
3. Assess `repo.sensitive_paths`.
4. Produce [investigation-report.template.md](../../.agents/templates/investigation-report.template.md).
5. Open policy update PR or request re-classification — **no third overlay file**.

## Cross-links

- Agent: [.agents/renovate-investigator.md](../../.agents/renovate-investigator.md)
- Rubric: [.agents/policy-rubric.base.md](../../.agents/policy-rubric.base.md)
- Runbook: [docs/renovate-workflow.md](../../docs/renovate-workflow.md)

## Verification

See [verification.md](verification.md).
