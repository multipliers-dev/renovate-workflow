---
name: renovate-maintainer
description: >-
  Executes Renovate classifier packets; re-verifies evidence and may merge when
  policy and CI allow. Use --approved with investigation overlay for
  investigation-approved high-touch merges. Use for renovate maintainer,
  dependency PR merge, or /renovate-maintainer.
disable-model-invocation: true
---

# Renovate maintainer

Executor for Renovate dependency PRs. Consumes one classifier execution packet, re-verifies live evidence against [`.agents/renovate-policy.yml`](../../../.agents/renovate-policy.yml), and may merge when all gates pass.

**Agent doc:** [`.agents/renovate-maintainer.md`](../../../.agents/renovate-maintainer.md) — follow it for ordered responsibilities, stop conditions, and run report.

Unlike [renovate-classifier](../renovate-classifier/SKILL.md), this skill **may** call merge tools when explicitly invoked and all gates pass.

## Invocation modes

Two modes — do not mix semantics across them.

| Mode               | Trigger                | Overlay required | Merge path                                                               |
| ------------------ | ---------------------- | ---------------- | ------------------------------------------------------------------------ |
| **Auto** (default) | classifier packet only | No               | Standard `merge_authority` from packet                                   |
| **`--approved`**   | user says `--approved` | **Yes**          | `investigation_approved_merge` via `evaluateEffectiveExecutionAuthority` |

**Required pairing:** `execution_mode: investigation_approved` overlay + invocation `--approved`. Hard-stop on mismatch:

- Overlay present without `--approved` → stop (no merge)
- `--approved` without overlay → stop (no merge)
- Overlay `execution_mode` other than `investigation_approved` → stop

The loop and investigator **never** pass `--approved` — human gate only.

## Governance

**Tier:** Tier 1 — GitHub read + merge when gated; one gitignored run report per PR

**State changed:**

- `.agent-runs/renovate/{YYYY-MM-DD}-pr-{N}.md` only (never committed)
- May merge one Renovate PR when all gates pass

**Default behavior:**

- preflight → validate packet → derive authority → evaluate stops → inspect (if needed) → pre-merge checks → merge authority gate → re-validate → merge → post-merge checks → run report

**Mutation command:**

- `merge_pull_request` (MCP) or `gh pr merge --merge` when all gates pass and merge authority allows (merge commit only — never `--squash` or `--rebase`; both are disabled by repo settings)

**Evidence gate:**

- Live `head_sha`, `policy_version`, and CI must match packet at preflight and immediately before merge
- Investigation-approved path additionally requires overlay fields and `evaluateEffectiveExecutionAuthority` success

**Override:**

- Investigation-approved path may suppress **narrow** classifier `stop_causes` per policy `execution_modes.investigation_approved.overridable_classifier_stops` — only when overlay + `--approved` + live gates pass

**Audit trail:**

- Run report records `original_merge_authority`, `effective_execution_authority`, `human_approval_modifier`, and `suppressed_stop_causes` when applicable

**Verification:**

- See [verification.md](verification.md)

## Task

For one classifier packet:

1. Preflight (policy version, head_sha, merge state)
2. Validate packet evidence against live PR
3. Derive effective execution authority (auto vs investigation-approved)
4. Evaluate triggered stops (narrow override only on investigation-approved path)
5. Run pre-merge checks from packet `required_checks`
6. Merge authority gate (standard or investigation-approved)
7. Re-validate immediately before merge
8. Merge when authorized
9. Post-merge checks
10. Write run report

## Input

- Classifier **execution packet** YAML (per [packet-schema.md](../renovate-classifier/packet-schema.md))
- Optional: explicit PR number (must match packet `pr.number`)
- Optional modifier: **`--approved`** — requires execution overlay YAML (see [Execution overlay](../renovate-classifier/packet-schema.md#execution-overlay-investigation-approved))

## Authority derivation

Use [`evaluateEffectiveExecutionAuthority`](../../../scripts/lib/renovate-guardrails.ts) as the sole authority derivation for the investigation-approved path:

```typescript
evaluateEffectiveExecutionAuthority(packet, policy, {
  overlay, // execution overlay when --approved
  humanApprovalModifier: "--approved", // only when user invoked --approved
});
```

| Result `effectiveExecutionAuthority` | Meaning                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `unchanged`                          | Auto path — use packet `classification.merge_authority`                     |
| `investigation_approved_merge`       | Overlay + `--approved` + live gates — merge despite denied packet authority |
| `denied`                             | Stop — record `reason` in run report                                        |

Record in run report:

- `original_merge_authority` — from `packet.classification.merge_authority`
- `effective_execution_authority` — from derivation result
- `human_approval_modifier` — `--approved` or null
- `suppressed_stop_causes` — when investigation-approved merge is derived

## Steps (summary)

Follow [`.agents/renovate-maintainer.md`](../../../.agents/renovate-maintainer.md) in order. Key investigation-approved differences:

### Pairing gate (before authority derivation)

1. If overlay YAML is supplied and user did **not** invoke `--approved` → **stop**; overlay without modifier is not authorized.
2. If user invoked `--approved` and no overlay → **stop**; modifier without overlay is not authorized.
3. If overlay `execution_mode !== investigation_approved` → **stop**.

### Triggered stops (step 3)

- **Auto path:** immediate stop on `stop: true`, `human_required`/`defer` decision, or non-empty `triggered_human_required`.
- **Investigation-approved path:** never evaluate raw `triggered_human_required` independently — call `evaluateTriggeredStops(packet, { executionMode: "investigation_approved", overridableStopReasons })` after successful `evaluateEffectiveExecutionAuthority`. Stop only when non-overridable `stop_causes` remain.

### Merge authority gate (step 6)

- **Auto path:** `evaluateMergeAuthority(packet, policy)` — denied `merge_authority` never merges.
- **Investigation-approved path:** proceed only when `effectiveExecutionAuthority === "investigation_approved_merge"`. Packet `merge_authority: denied` stays immutable on the packet; derivation grants merge eligibility only at execute time.

### Investigation report check

When overlay is present, confirm `investigation.report_path` exists on disk (read the file). Missing report → stop.

## Copy/paste prompts

### Auto path (default)

```
@.agents/renovate-maintainer.md

Execute for PR #{N}. Input packet (YAML):
---BEGIN PACKET---
(paste packet from renovate-classifier)
---END PACKET---

Merge only if merge_authority conditions are satisfied.
Stop if policy_version differs from renovate-policy.yml at preflight or immediately before merge, if head_sha differs from live PR at preflight or immediately before merge, if mergeStateStatus is BEHIND at preflight, if triggered_human_required is non-empty, or if any human_required_if watch condition becomes true during inspection.
Write run report to .agent-runs/renovate/{date}-pr-{N}.md using .agents/templates/renovate-run-report.md
```

### Investigation-approved path (`--approved`)

```
@.agents/renovate-maintainer.md

/renovate-maintainer --approved

Execute for PR #{N}. Input packet (YAML):
---BEGIN PACKET---
(paste classifier packet — unchanged)
---END PACKET---

Execution overlay (YAML):
---BEGIN OVERLAY---
(paste overlay from renovate-investigator normal invocation)
---END OVERLAY---

Derive effective_execution_authority via evaluateEffectiveExecutionAuthority.
Merge only when effective_execution_authority is investigation_approved_merge and all pre-merge checks pass.
Do not stop based on raw triggered_human_required or stop: true alone — use evaluateTriggeredStops with stop_causes only.
Hard-stop if --approved is present without overlay, or overlay without --approved.
Write run report to .agent-runs/renovate/{date}-pr-{N}.md using .agents/templates/renovate-run-report.md
```

## Failure modes

| Condition                                      | Behavior                          |
| ---------------------------------------------- | --------------------------------- |
| Overlay without `--approved`                   | Stop; no merge                    |
| `--approved` without overlay                   | Stop; no merge                    |
| `evaluateEffectiveExecutionAuthority` denied   | Stop; record reason in run report |
| Non-overridable `stop_causes` on approved path | Stop                              |
| Missing investigation report file              | Stop                              |
| Auto path with `merge_authority: denied`       | Stop (unchanged)                  |

## References

- Agent: [`.agents/renovate-maintainer.md`](../../../.agents/renovate-maintainer.md)
- Packet schema: [packet-schema.md](../renovate-classifier/packet-schema.md)
- Policy: consumer `.agents/renovate-policy.yml` (template: [`.agents/renovate-policy.template.yml`](../../../.agents/renovate-policy.template.yml))
- Run report: [`.agents/templates/renovate-run-report.md`](../../../.agents/templates/renovate-run-report.md)
