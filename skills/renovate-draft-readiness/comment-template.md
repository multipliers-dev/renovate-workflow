# Managed comment template

Exactly **one** managed issue comment per draft PR. Identity marker (required in every published body):

```html
<!-- renovate-draft-readiness -->
```

Place the marker on its own line at the **end** of the comment body. Find existing managed comments by substring match on that exact marker. Never edit comments that lack it.

## Create — first managed body (`remain_draft` / `needs_human`)

```markdown
## Why this PR is draft / not ready to merge

{1–3 sentence summary of why the bump cannot land safely yet.}

### 1. {Primary blocker title}

{Evidence: peers, upstream links, install errors, file list.}

### 2. {Secondary blocker or CI / incomplete diff}

{Evidence.}

### 3. What would be required later

{Unblock criteria. Note that lockfile-only fixes are insufficient when ecosystem blockers remain.}

{Closing guidance: keep draft; do not close if ignore-on-close would suppress future attempts.}

<!-- renovate-draft-readiness -->
```

## Create — first managed body (`ready_to_unpark`)

```markdown
## Why this PR can leave draft

{1–3 sentence summary: leave-draft blockers cleared; recommend human Ready for review.}

### 1. Readiness evidence

{What was checked: ecosystem, diff completeness, CI on current head.}

### 2. Remaining non-blockers

{e.g. BEHIND vs main — report only; ladder will sync after unpark. Do not claim this skill updated the branch.}

### 3. Operator next step

Mark **Ready for review**, then run `/renovate-classifier` (or `/renovate-loop`). This skill does not unpark or enter the merge ladder.

<!-- renovate-draft-readiness -->
```

## Update — rewrite on re-run

Replace the **entire** managed comment body (do not append a second comment). Use today's date (`YYYY-MM-DD`, prefer `Australia/Sydney`):

```markdown
## Update (YYYY-MM-DD)

{1–3 sentence re-check summary. Reference that prior assessment holds or what changed.}

### 1. Ecosystem / blockers

{Current evidence.}

### 2. Diff / CI / freshness

{Incomplete diff, CI on current head, mergeStateStatus — no branch update.}

### 3. Verdict and next step

- Verdict: `remain_draft` | `ready_to_unpark` | `needs_human`
- {Unblock criteria or Ready-for-review recommendation}
- Policy preview (advisory): {risk class / likely ladder route}

<!-- renovate-draft-readiness -->
```

## Voice notes (match PR #436)

- Prefer concrete peer ranges and command/error excerpts in fenced `text` blocks
- Link upstream issues when known
- Distinguish “immediate CI failure” from “ecosystem not ready”
- Explicitly say regenerating the lockfile alone is not enough when that is true
- Prefer draft over close when the intent is resume-later
- Do not include classifier execution packets or `stop_causes`
