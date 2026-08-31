---
name: review-renovate
description: Gather evidence for high-touch Renovate PRs before merge — release notes, repo usage, custom risk, validation.
---

# Review Renovate PR

Evidence loop for `review_manually` PRs. Interpret policy via [policy-rubric.base.md](../../.agents/policy-rubric.base.md).

## When to use

- Classifier emitted `review_manually`
- Major or runtime dependency bumps
- Human requested evidence before merge

## Four-step loop

1. **Upstream** — release notes / migration guide; list breaking changes
2. **Usage** — map dependency usage under `repo.workspace_roots`
3. **Custom risk** — inspect `repo.sensitive_paths` and config surfaces
4. **Validation** — run or verify `checks.required` (CI workflow + commands)

Zero source changes is a **conclusion** after this loop, not the default assumption.

## Outputs

- Evidence summary appended to maintainer decision or audit JSON
- Explicit statement: migration required yes/no, with proof

## Cross-links

- Runbook: [docs/renovate-workflow.md](../../docs/renovate-workflow.md)
- Rubric: [.agents/policy-rubric.base.md](../../.agents/policy-rubric.base.md)
- Classifier: [renovate-classifier/SKILL.md](../renovate-classifier/SKILL.md)
- Checklist: [checklist.md](checklist.md)

## Verification

See [verification.md](verification.md).
