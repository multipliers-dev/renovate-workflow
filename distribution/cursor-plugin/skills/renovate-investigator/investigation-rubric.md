# Renovate investigation rubric

Classification rules for **renovate-investigator** verdicts. Apply after the [four-step checklist](investigation-checklist.md).

## Eligibility gate (before investigation)

Run [`evaluateInvestigationEligibility`](node_modules/renovate-workflow/scripts/lib/renovate-investigation-eligibility.ts) against the classifier packet and live [`.agents/renovate-policy.yml`](../../../.agents/renovate-policy.yml).

| Result            | Behavior                                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eligible: true`  | Proceed with four-step investigation                                                                                                                                                         |
| `eligible: false` | **Halt investigation** (skip four-step work and overlay); write report with verdict `not_eligible` and `eligibility_reason` in normal/fixture verification; chat summary only in `chat only` |

Common ineligible reasons:

- `risk_class` not in `execution_modes.investigation_approved.eligible_risk_classes`
- Non-overridable `stop_causes` remain (e.g. `triggered_lockfile_threshold_exceeded`)
- Missing or fail-closed `stop_causes` when `stop: true`
- `decision` not `human_required` or `merge_authority` not `denied`

Operator check:

```bash
npm exec -- tsx -e "
import { readFileSync } from 'node:fs';
import yaml from 'yaml';
import { evaluateInvestigationEligibility } from './scripts/lib/renovate-investigation-eligibility.ts';
import { loadRenovatePolicy } from './scripts/lib/renovate-guardrails.ts';
const packet = yaml.parse(readFileSync(process.argv[1], 'utf8'));
const policy = loadRenovatePolicy('.agents/renovate-policy.yml');
console.log(JSON.stringify(evaluateInvestigationEligibility(packet, policy), null, 2));
" scripts/fixtures/renovate-packets/high-touch-patch-investigate.yaml
```

## Verdict enum

| Verdict                  | Meaning                                                                                                            | Handoff artifact                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `ready_for_human_merge`  | Four-step evidence supports merge without migration; custom risks resolved; changed files ⊆ policy `allowed_paths` | **Normal:** production-executable overlay. **Fixture verification:** `verification_only` + `expected_overlay` only |
| `needs_migration`        | Evidence shows implementation work is required before merge                                                        | Do not emit                                                                                                        |
| `custom_risk_unresolved` | Step 3 flagged project-specific risk without step 4 validation                                                     | Do not emit                                                                                                        |
| `inconclusive`           | Insufficient evidence to conclude; gaps documented                                                                 | Do not emit                                                                                                        |
| `not_eligible`           | Packet failed eligibility gate                                                                                     | Do not emit                                                                                                        |
| `stale_packet`           | Live `head_sha` or `policy_version` drift vs packet at investigation time                                          | Do not emit                                                                                                        |

Policy `execution_modes.investigation_approved.requires_investigation_verdict` is `ready_for_human_merge` — other verdicts route to human review without the investigation-approved maintainer path.

## `ready_for_human_merge` gates

All must pass:

1. Eligibility gate passed at investigation start (re-check if packet ages mid-run)
2. Step 1–4 sections in report are **Sufficient** per step verdict labels below
3. No `human_required_if` watch condition **confirmed true** during investigation beyond what the classifier already captured
4. `evidence.changed_files` ⊆ `execution_modes.investigation_approved.allowed_paths` (`**/package.json`, `package-lock.json`)
5. Freshness binding satisfied at report write time:
   - **Normal:** live PR `head_sha` matches packet `pr.head_sha`
   - **Fixture verification:** mocked live evidence `pr.head_sha` matches packet `pr.head_sha` (no live PR re-fetch)
6. `policy_version` on packet matches live `renovate-policy.yml` `version` (or mocked `policy_version` in fixture verification)

## Fixture verification (offline)

For operator/CI checks of the vitest #402 packet shape:

- Packet: `scripts/fixtures/renovate-packets/high-touch-patch-investigate.yaml`
- Mocked live evidence: `scripts/fixtures/renovate-packets/high-touch-patch-investigate-live.yaml`
- Do **not** re-fetch live PR #402 — the placeholder `cafebabe…` head SHA is intentional and must match both fixtures
- Write gitignored report; emit `verification_only: true` + `expected_overlay` when verdict is `ready_for_human_merge`
- **Never** emit a production-executable overlay or maintainer handoff instructions
- Not the same as `chat only` (which writes no report and emits no `expected_overlay`)

## Step verdict labels

Use in each checklist section of the report:

| Label            | When to use                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| **Sufficient**   | Evidence answers the step question with repo-specific proof                                     |
| **Partial**      | Some evidence gathered; gaps noted — blocks `ready_for_human_merge` unless resolved in same run |
| **Insufficient** | Could not answer the step — blocks `ready_for_human_merge`                                      |

## Risk posture

| Packet signal                                                   | Investigation emphasis                                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `triggered_runtime_behavior_affected_sole`                      | High-touch package on manifest-only diff — prove runtime/test surfaces unchanged          |
| `implementation_changes_required` in `triggered_human_required` | Ineligible for investigation lane — stop at eligibility gate                              |
| `lockfile_threshold_exceeded`                                   | Ineligible — stop at eligibility gate                                                     |
| `ci_failure_unexplained`                                        | Ineligible unless sole cause is overridable per policy — usually stop at eligibility gate |

## Human audit framing

The investigator **does not merge** and **does not grant merge authority**. It assembles an evidence packet for human audit.

When verdict is `ready_for_human_merge`, the human still:

1. Reads the investigation report
2. Invokes `/renovate-maintainer --approved` in a fresh chat (see [renovate-maintainer SKILL.md](../renovate-maintainer/SKILL.md)) with classifier packet + execution overlay

Classifier `classification.merge_authority: denied` stays immutable on the packet.
