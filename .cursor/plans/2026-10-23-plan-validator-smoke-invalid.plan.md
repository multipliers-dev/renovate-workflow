---
name: plan-validator smoke invalid
overview: Disposable negative smoke for centralized plan validation adoption.
todos:
  - id: smoke
    content: "Smoke: invalid plan missing agent prompts section"
    status: pending
isProject: false
---

# Plan-validator smoke (invalid)

## Recommended execution authority

| Slice | Recommended authority | Agent instruction |
| --- | --- | --- |
| smoke | Open PR only | Do not merge. Stop after opening the PR. |

Repo default: **Open PR only**

## Slice — smoke

**Recommended authority:** Open PR only

**Rationale:**

- Negative smoke only

**Agent instruction:** Do not merge.

**Acceptance:**

- Validator reports `[prompts.section]`
