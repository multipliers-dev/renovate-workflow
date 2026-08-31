# Renovate draft-readiness verification checklist

Manual checks for **renovate-draft-readiness**. Comment upsert is required on every successful live run — there is no dry-run mode.

## Prerequisites

- Authenticated `gh` with repo **write** (comment create/PATCH) — **required at preflight**; MCP-only is insufficient
- GitHub MCP optional for reads
- At least one open **draft** Renovate PR in the consumer repository
- `.agent-runs/renovate/` writable (gitignored)
- Local git remote points at the active repository

## 0. Preflight

- [ ] Run stops at §0 when `gh` is missing or lacks write (no assessment / success report)
- [ ] MCP-only session does **not** proceed past preflight

## Invocation

```
@.cursor/skills/renovate-draft-readiness/SKILL.md

/renovate-draft-readiness 436
```

FIFO (no number) when the draft queue’s lowest number is the intended target:

```
@.cursor/skills/renovate-draft-readiness/SKILL.md

/renovate-draft-readiness
```

## 1. Discovery and selection

- [ ] Discovery uses classifier §2 Renovate identity (`renovate/` head-branch; author-search fallback only when zero head-branch Renovate PRs)
- [ ] Discovery **paginates** open-PR list pages (full page of 100 → fetch next; merge all pages before filtering) — same rule as classifier §2
- [ ] Queue is **draft-only**; active non-draft Renovate PRs are listed but not selectable
- [ ] Explicit `#` in the draft set selects that PR; FIFO picks lowest draft number
- [ ] Explicit non-draft Renovate PR → stop; operator directed to `/renovate-classifier`
- [ ] Zero drafts → stop without comment upsert

## 2. Assessment contract

- [ ] Evidence covers ecosystem blockers, incomplete diff, CI on current head, branch freshness (report-only), policy preview (advisory)
- [ ] Policy preview uses package-list / `risk_class` labels only — no merge / review manually / defer recommendations from classifier rubric
- [ ] Verdict is one of `remain_draft` | `ready_to_unpark` | `needs_human`
- [ ] No `gh pr update-branch` / rebase
- [ ] No classifier execution packet / `stop_causes` / merge authority

## 3. Evidence gate before report

- [ ] Success report is written **only after** re-fetch confirms open + draft + Renovate identity and assessment `head_sha` matches live head
- [ ] Gate failure → no success-shaped report (optional `gate_failed` note only); no comment upsert
- [ ] Chat summary does not present an unbound pre-gate verdict as final

## 4. Managed comment upsert (required on gate pass)

Against live draft **#436** (or current FIFO draft):

- [ ] Comment upsert runs only after evidence gate + success report path
- [ ] **Pre-publish recheck:** live `head_sha` (and open/draft/Renovate) re-fetched immediately before create/PATCH and matches bound SHA
- [ ] Comment body includes exact marker `<!-- renovate-draft-readiness -->`
- [ ] First managed publish uses create shape (`## Why this PR is draft…` or ready variant); re-run rewrites with `## Update (YYYY-MM-DD)`
- [ ] Exactly one managed comment (create once, then PATCH same id) — no duplicate marker comments
- [ ] Historical comments **without** the marker are left untouched
- [ ] Chat reports comment action `created` or `updated` with comment id

## 5. Gitignored report

- [ ] On gate pass: report written to `.agent-runs/renovate/{YYYY-MM-DD}-pr-{N}-draft-readiness.md`
- [ ] Sections match [`.agents/templates/renovate-draft-readiness-report.md`](../../agents/templates/renovate-draft-readiness-report.md)
- [ ] Bound `head_sha` in report matches live head at gate time
- [ ] File is not staged or committed

## 6. Forbidden actions (authority audit)

Confirm the run did **not**:

- [ ] Merge (`gh pr merge` / merge tools)
- [ ] Approve / submit review
- [ ] Mark ready for review (`gh pr ready`)
- [ ] Close the PR
- [ ] Update or rebase the Renovate branch
- [ ] Add/remove labels (unless a later plan scopes them)
- [ ] Feed maintainer or investigator / emit execution packet

## 7. Classifier regression (active queue unchanged)

Confirm `/renovate-classifier` still skips drafts:

```
@.cursor/skills/renovate-classifier/SKILL.md

/renovate-classifier 436
```

- [ ] Discovery reconciliation lists #436 under **Draft Renovate PRs skipped** (or equivalent)
- [ ] Explicit `#436` is rejected as not in the active (non-draft) set — no analysis packet for #436
- [ ] Active FIFO behavior unchanged for non-draft Renovate PRs

## 8. Modes absent

- [ ] SKILL.md documents **no** dry-run / `chat only` / `apply` modes
- [ ] Successful runs always attempt managed comment upsert after the evidence gate (and success report)

## Allowed gitignored outputs

- `.agent-runs/renovate/{YYYY-MM-DD}-pr-{N}-draft-readiness.md`
