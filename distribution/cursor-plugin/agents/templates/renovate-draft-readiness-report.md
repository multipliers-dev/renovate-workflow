# Renovate draft readiness — {date} — PR #{N}

## PR reviewed

- URL:
- Branch:
- Title:
- Head SHA (bound):
- isDraft: true
- Renovate identity: head-branch | author-search

## Discovery

- Method: head-branch | author-search
- Draft queue: (#…)
- Selected: #{N} (FIFO | explicit)
- Active (non-draft) Renovate PRs (not selectable): (#…)

## Verdict

- verdict: remain_draft | ready_to_unpark | needs_human | gate_failed
- rationale:
- evidence_gate: passed | failed (reason)

## Evidence

### Ecosystem blockers

- findings:
- upstream links:

### Incomplete Renovate diff

- changed files:
- lockfile present/updated: yes | no | n/a
- notes:

### CI state

- head_sha:
- status: green | failing | pending | unknown
- notable failures:

### Branch freshness (report only — no update)

- base:
- mergeStateStatus:
- mergeable:
- note: skill must not run gh pr update-branch

### Policy classification preview (advisory)

- likely risk_class / route: # package-list label only (e.g. high_touch_tooling)
- notes: no execution packet; no merge/review/defer recommendation; draft verdict wins

## Unblock criteria

- remain_draft / needs_human: what must change before unpark
- ready_to_unpark: human Ready for review, then /renovate-classifier or /renovate-loop

## Managed comment

- action: created | updated
- comment_id:
- marker present: yes
- head_sha at publish:

## Authority audit

- [ ] Did not merge, approve, ready, close, or update-branch
- [ ] Did not emit classifier execution packet
- [ ] Did not feed maintainer / investigator
