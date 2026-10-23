---
name: plan-validator smoke valid
overview: Disposable positive smoke for centralized plan validation adoption.
todos:
  - id: smoke
    content: "Smoke: minimal valid active plan"
    status: pending
isProject: false
---

# Plan-validator smoke (valid)

## Recommended execution authority

| Slice | Recommended authority | Agent instruction |
| --- | --- | --- |
| smoke | Open PR only | Do not merge. Stop after opening the PR. |

Repo default: **Open PR only**

## Slice — smoke

**Recommended authority:** Open PR only

**Rationale:**

- Positive smoke only

**Agent instruction:** Do not merge. Stop after opening the PR.

**Goal:** Confirm validator accepts a minimal methodology-shaped plan.

**Acceptance:**

- `plan-validator` exits 0 on this file.

---

## Agent prompts (copy/paste for Cursor)

### smoke

```text
@.cursor/plans/2026-10-23-plan-validator-smoke-valid.plan.md

Implement slice smoke only.

Authority: Open PR only — implement and open the PR; do not merge.

Topology: start from latest origin/main; branch represents only this slice; PR base must be main.

Deliverables: none (smoke file only). Mark smoke completed in plan frontmatter in this PR.

Verification: centralized Validate plans workflow passes on push.
```
