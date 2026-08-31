# Renovate investigation — {date} — PR #{N}

## PR reviewed

- URL:
- Branch:
- Title:
- Packet decision:
- Packet merge_authority: denied (immutable)
- risk_class:
- stop_causes:

## Eligibility

- eligible: yes | no
- eligibility_reason (if no):
- policy_version: packet vs live (match / drift)
- head_sha: packet vs live at investigation time (match / stale)

## Verdict

- verdict: ready_for_human_merge | needs_migration | custom_risk_unresolved | inconclusive | not_eligible | stale_packet
- rationale:

## Step 1 — Inspect upstream change

- step_verdict: Sufficient | Partial | Insufficient
- packages and version bumps:
- documented breaking changes / migration notes:
- plausible failure modes named:

## Step 2 — Map to actual usage

- step_verdict: Sufficient | Partial | Insufficient
- import / config usage findings:
- upstream risk → used | not used | unknown:

## Step 3 — Custom risk

- step_verdict: Sufficient | Partial | Insufficient
- project-specific risks identified:
- triggered_human_required explanation:
- custom risk status: resolved | unresolved

## Step 4 — Validate the app

- step_verdict: Sufficient | Partial | Insufficient
- CI status (link):
- preview / integration validation (if applicable):
- lockfile threshold re-check (if on packet):

## Evidence summary

- changed_files:
- implementation changes required: yes | no
- migration work required: yes | no

## Unresolved concerns

- items blocking merge:
- recommended next action:

## Execution overlay (normal invocation only — when verdict is ready_for_human_merge)

```yaml
execution_mode: investigation_approved
investigation:
  report_path:
  verdict: ready_for_human_merge
  investigated_at:
  investigation_head_sha:
```

## Expected overlay (fixture verification only — verification_only, not for maintainer)

```yaml
verification_only: true
invocation_mode: fixture_verification
expected_overlay:
  execution_mode: investigation_approved
  investigation:
    report_path:
    verdict: ready_for_human_merge
    investigated_at:
    investigation_head_sha:
```

## Human gate (normal invocation only)

- [ ] Human audited this report
- [ ] Fresh chat: `/renovate-maintainer --approved` with classifier packet + overlay above
