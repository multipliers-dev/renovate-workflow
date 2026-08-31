# Renovate maintainer run — {date} — PR #{N}

## PR reviewed

- URL:
- Branch:
- Title:
- Packet decision:

## Decision

- decision:
- merge_authority:
- risk_class:
- stop / proceed rationale:

## Execution authority (investigation lane)

- original_merge_authority: # packet classification.merge_authority (immutable)
- effective_execution_authority: unchanged | investigation_approved_merge | denied
- human_approval_modifier: null | --approved
- suppressed_stop_causes: [] # when investigation_approved_merge
- authority_derivation_reason: # when denied — from evaluateEffectiveExecutionAuthority

## Evidence

- packages:
- changed files:
- CI status:
- lockfile delta:
- repo usage inspection notes (if agent_review_required):

## Checks run

- [ ] pr_ci_green (pre-merge, link)
- [ ] validate_renovate_config (if applicable)
- [ ] workflow_uses_pin_only (if applicable — hard gate)
- [ ] lockfile_within_threshold (if applicable — hard gate)
- [ ] post_merge_main_ci_green (post-merge, link)

## Policy and stale packet checks

- policy_version preflight: packet vs renovate-policy.yml (match / drift — stopped if mismatch or missing)
- policy_version pre-merge: packet vs renovate-policy.yml immediately before merge (match / drift — stopped if mismatch or missing)
- preflight head_sha: packet vs live PR (match / stale — stopped if stale)
- pre-merge head_sha: packet vs live PR immediately before merge (match / stale — stopped if stale)
- evidence_checked_at:

## Merge result

- merged | not_merged | stopped
- merge SHA / reason:

## CI links

- PR checks URL:
- main workflow run URL:

## Unresolved concerns

- items for human follow-up:
