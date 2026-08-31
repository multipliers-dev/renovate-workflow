# Renovate maintainer agent

Executor prompt for Renovate dependency PRs. Consumes an execution packet from [renovate-classifier](../.cursor/skills/renovate-classifier/SKILL.md) (classifier) and may merge when policy and checks allow.

**Policy sync note:** When [policy-rubric.base.md](policy-rubric.base.md) or consumer `renovate.json` changes, update consumer `.agents/renovate-policy.yml` in the same PR.

Unlike the classifier skill, this agent **may** call merge tools when explicitly invoked and all gates pass.

---

## Quick start (manual Phase 2)

Human walkthrough: [`docs/renovate-workflow.md`](../docs/renovate-workflow.md).

1. Run `/renovate-classifier` (or `@renovate-classifier` skill) to classify the next FIFO Renovate PR (or an explicit PR number) and emit one execution packet.
2. Copy one PR's execution packet and the [copy/paste prompt](#copypaste-prompt) into a **fresh Agent-mode chat**.
3. The agent executes verification and merge (or stop). Human handles any `stop: true` outcomes.

No hooks or automation — invoke only when you intend the agent to act on a specific PR.

---

## Input

- Renovate PR number (or URL)
- Execution packet YAML from renovate-classifier (per [packet-schema.md](../.cursor/skills/renovate-classifier/packet-schema.md))
- Optional: **execution overlay** YAML (required when invoked with `--approved`; see [Execution overlay](../.cursor/skills/renovate-classifier/packet-schema.md#execution-overlay-investigation-approved))

---

## Invocation modes

| Mode               | Trigger                | Overlay      | Authority derivation                                                   |
| ------------------ | ---------------------- | ------------ | ---------------------------------------------------------------------- |
| **Auto** (default) | packet only            | None         | Packet `classification.merge_authority` via `evaluateMergeAuthority`   |
| **`--approved`**   | user says `--approved` | **Required** | `evaluateEffectiveExecutionAuthority` → `investigation_approved_merge` |

**Hard pairing gate (before any merge attempt):**

- Overlay without `--approved` → **stop immediately**
- `--approved` without overlay → **stop immediately**
- Overlay `execution_mode` ≠ `investigation_approved` → **stop immediately**

The loop and investigator never pass `--approved`. Human gate only.

---

## Preflight

Before any action:

1. **GitHub MCP or authenticated `gh`** available — read + **write** merge tools allowed here (MCP `merge_pull_request` or `gh pr merge`), unlike the classifier skill.
2. Read [renovate-policy.yml](renovate-policy.yml) before acting.
3. Read [packet-schema.md](../.cursor/skills/renovate-classifier/packet-schema.md) for field semantics.
4. **Policy version check (hard gate)** — `packet.policy_version` must equal `version` in [renovate-policy.yml](renovate-policy.yml). If missing or mismatch → **stop immediately**; do not merge. Ask the user to re-run `/renovate-classifier` so classification runs under current policy.
5. **Base branch freshness (hard gate)** — re-fetch live `mergeStateStatus` via GitHub MCP **or** `gh pr view <N> --json mergeStateStatus`. If `mergeStateStatus == BEHIND` → **stop immediately**; do not merge. A sibling Renovate PR may have merged after classification and moved `main`. Ask the user to re-run `/renovate-classifier` (classifier runs `gh pr update-branch` when appropriate) or update the branch manually, then re-classify.

---

## Responsibilities (ordered)

Execute in order. Stop as soon as a hard stop condition fires; write the run report and summarize in chat.

### 1. Stale packet check (hard gate — preflight)

Re-fetch the PR via GitHub MCP **or** `gh pr view --json headRefOid,mergeStateStatus`.

- If live `head.sha` differs from packet `pr.head_sha` → **stop immediately**; do not merge. Ask the user to re-run `/renovate-classifier` to refresh the packet.
- If live `mergeStateStatus == BEHIND` → **stop immediately**; do not merge. Ask the user to re-run `/renovate-classifier` (classifier syncs via `gh pr update-branch` when `BEHIND`) or update the branch on GitHub, then re-classify.

Record preflight stale status and merge state in the run report.

### 1b. Pairing gate and authority derivation (hard gate)

After preflight, before triggered-stop evaluation:

1. **Pairing** — if overlay is present and invocation is not `--approved`, or `--approved` without overlay, or overlay `execution_mode !== investigation_approved` → **stop immediately**; record in run report.
2. **Derive authority** — call `evaluateEffectiveExecutionAuthority(packet, policy, { overlay, humanApprovalModifier })` from [`scripts/lib/renovate-guardrails.ts`](../scripts/lib/renovate-guardrails.ts):
   - Auto path (no overlay): `humanApprovalModifier` omitted; expect `effectiveExecutionAuthority: unchanged`.
   - `--approved` path: `humanApprovalModifier: "--approved"`; expect `investigation_approved_merge` or `denied` with `reason`.
3. **Investigation report** — when overlay is present, read `overlay.investigation.report_path` from disk. Missing file → **stop**.
4. Record in run report: `original_merge_authority`, `effective_execution_authority`, `human_approval_modifier`, `suppressed_stop_causes` (when applicable), and `authority_derivation_reason` (when denied).

### 2. Validate packet

Confirm remaining evidence still matches live state:

- CI status, draft state
- Changed files vs packet `evidence.changed_files`
- `evidence.workflow_changes.uses_pin_only` and `same_major_only` when workflows touched
- `evidence.lockfile_delta.within_threshold`, `pr_file_count`, `lockfile_maintenance`

If live evidence contradicts the packet in ways that would change classification → stop (default to review manually).

### 3. Evaluate triggered stops

**Auto path** (`effectiveExecutionAuthority === "unchanged"`): stop immediately (write run report, do not merge) if **any**:

- `classification.decision` is `human_required` or `defer`
- `triggered_human_required` is non-empty
- `stop: true`

**Investigation-approved path** (`effectiveExecutionAuthority === "investigation_approved_merge"`):

- Call `evaluateTriggeredStops(packet, { executionMode: "investigation_approved", overridableStopReasons })` where `overridableStopReasons` comes from `resolveOverridableClassifierStops(policy, risk_class)`.
- If result `stop: true` → **stop** (non-overridable causes remain active).
- If `effectiveExecutionAuthority === "denied"` → **stop** (already handled in step 1b).

**`triggered_human_required` vs `human_required_if`:**

- **`triggered_human_required`** — conditions that **already fired** at classification time (e.g. `runtime_behavior_affected`, `lockfile_threshold_exceeded`, `implementation_changes_required`, `ci_failure_unexplained`).
  - **Auto path:** non-empty list → **immediate stop**; do not attempt merge or further inspection for merge eligibility.
  - **Investigation-approved path:** do **not** evaluate the raw list independently. Authoritative input is `stop_causes` via `evaluateTriggeredStops(packet, { executionMode: "investigation_approved", overridableStopReasons })`. Stop only when non-overridable structured causes remain after policy allowlist suppression (e.g. `decision_human_required`, `stop_flag_expected_human_required`, and `triggered_runtime_behavior_affected_sole` may be suppressed; `triggered_lockfile_threshold_exceeded` may not).
- **`human_required_if`** — latent watch conditions **not yet confirmed**. Continue through inspection and pre-merge checks on **both** paths, but if inspection **confirms** any watch condition → stop and append findings to the run report.

Watch-list keys (not `risk_class` values): `implementation_changes_required`, `lockfile_threshold_exceeded`, `ci_failure_unexplained`, `runtime_behavior_affected`.

### 4. Inspect repo usage (when `decision: agent_review_required`)

For `agent_review_required` packets (typically `low_risk_tooling_major`):

- Grep/import analysis for bumped packages
- Confirm no implementation changes needed beyond what the packet allows
- If inspection confirms any `human_required_if` watch condition → stop; document in run report

Skip deep inspection for `auto_merge_eligible` when the packet already satisfies rubric gates.

### 5. Verify pre-merge checks

Run **every** check listed in packet `required_checks` whose policy `checks.<name>.when` is `pre_merge`.

**Authoritative rule:** verify **only** checks on the packet list. Policy `check_assembly` documents how the classifier builds `required_checks` — do **not** add conditional checks absent from the packet.

| Check                       | When on packet                   | MCP (preferred)                                                                                                                                                                        | `gh` fallback                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pr_ci_green`               | always                           | PR check runs green via `get_check_runs`; maps to consumer `checks.pr_ci_green` workflow/job                                                                              | `gh pr checks <N>` — all required checks passing                                                                                                                                                                                                                                                                                       |
| `validate_renovate_config`  | when `renovate.json` changed     | Config validation workflow green via `get_check_runs`                                                                                                                                  | `gh pr checks <N>` — Renovate config validation check green                                                                                                                                                                                                                                                                            |
| `workflow_uses_pin_only`    | when workflows changed           | **Hard gate:** re-verify every diff hunk in `.github/workflows/*.yml` is a `uses:` pin **within the same Action major** via `get_diff`. Non-`uses:` edits or Action major bumps → stop | **Hard gate:** same rule via `gh pr diff <N>` — inspect every `.github/workflows/*.yml` hunk                                                                                                                                                                                                                                           |
| `lockfile_within_threshold` | when `package-lock.json` changed | **Hard gate:** re-fetch `get_files`; recompute `pr_file_count`; confirm `line_delta_total` ≤ `line_delta_limit` and single-package `pr_file_count` ≤ 30                                | **Hard gate:** `gh pr view <N> --json files` — `pr_file_count` = file count; `line_delta_total` = `package-lock.json` entry `additions + deletions` (same metric as MCP `get_files` per [policy-rubric.base — Lockfile impact](policy-rubric.base.md#lockfile-impact)); confirm ≤ `line_delta_limit` and single-package `pr_file_count` ≤ 30 |

Any pre-merge check failure → stop.

### 6. Merge authority gate

**Auto path** (`effectiveExecutionAuthority === "unchanged"`):

Look up packet `classification.risk_class` **directly** in [renovate-policy.yml](renovate-policy.yml) — no secondary mapping layer.

Consult `merge_authority_rules` for the packet's `classification.merge_authority`:

- **`allowed`** — merge if pre-merge checks pass. Includes `github_action_pin_same_major`; workflow eligibility enforced by `workflow_uses_pin_only`, not manifest-only paths.
- **`allowed_if_no_code_changes`** (`low_risk_tooling_major` only) — merge only if changed files ⊆ `{**/package.json, package-lock.json}`. If any `.github/workflows/*.yml` changed → **stop** (misclassified packet or stale evidence).
- **`denied`** — never merge.

If `risk_class` is not listed under the packet's `merge_authority` rule, or policy denies the class → stop.

Alternatively, use `evaluateMergeAuthority(packet, policy)` — any `stop: true` → stop.

**Investigation-approved path** (`effectiveExecutionAuthority === "investigation_approved_merge"`):

- Proceed to merge re-validation when pre-merge checks pass.
- Packet `classification.merge_authority` stays `denied` on the packet (immutable classifier output); execute-time derivation grants merge eligibility only.
- If derivation did not yield `investigation_approved_merge` → stop (should not reach this step).

**Denied path** (`effectiveExecutionAuthority === "denied"`):

- Stop; record `authority_derivation_reason` in run report.

### 7. Re-validate before merge (hard gate — immediately before merge)

Immediately before calling `merge_pull_request` or `gh pr merge`:

1. Re-read live `version` from [renovate-policy.yml](renovate-policy.yml). Compare to `packet.policy_version`. If missing or mismatch → **stop**; do not merge. Ask user to re-run `/renovate-classifier`.
2. Re-fetch the PR via GitHub MCP **or** `gh pr view --json headRefOid`. Compare live `head.sha` to packet `pr.head_sha`. If they differ → **stop**; do not merge. Ask user to re-run `/renovate-classifier`.

Steps 2–6 may take minutes; policy or PR head may change after preflight.

Record pre-merge policy_version and head_sha checks in the run report.

### 8. Merge (if authorized)

Call `merge_pull_request` (MCP, preferred in packet workflow) **or** `gh pr merge --merge` (first-class fallback). Verify merge succeeded.

**Merge method (hard rule):** This repository allows **merge commits only**. Always use merge-commit (`gh pr merge --merge`, or MCP equivalent with merge commit). Do **not** attempt `--squash` or `--rebase` — both are disabled by repo settings and will fail.

**Merge authority guard:** `gh pr merge` is allowed only when this maintainer agent is invoked with a valid packet and all pre-merge gates pass. This is a transport fallback for the same gated merge step — it does **not** expand merge authority to generic agent sessions or Open PR only slices.

### 9. Verify post-merge checks

Run checks in packet `required_checks` whose policy `checks.<name>.when` is `post_merge`:

- **`post_merge_main_ci_green`** — confirm main branch `CI` / `test` succeeded after merge (via `gh run list` or MCP)

Post-merge failure → report in run report and chat; do not attempt to revert automatically.

### 10. Report

Write run report from [templates/renovate-run-report.md](templates/renovate-run-report.md) to `.agent-runs/renovate/{date}-pr-{N}.md` (create directory on first write). Filename convention: `YYYY-MM-DD-pr-{number}.md`. Summarize outcome in chat.

---

## Stop conditions (hard)

**All paths:**

- Overlay present without `--approved`, or `--approved` without overlay, or overlay `execution_mode` ≠ `investigation_approved`
- `evaluateEffectiveExecutionAuthority` returns `denied`
- Missing investigation report at `overlay.investigation.report_path`
- `packet.policy_version` missing or ≠ live `renovate-policy.yml` `version` at **preflight** or **immediately before merge** (policy drift)
- PR `head_sha` differs from packet at **preflight** or **immediately before merge** (stale packet)
- Live `mergeStateStatus == BEHIND` at **preflight** (base branch moved after classification)
- Any `human_required_if` watch condition confirmed true during inspection
- Any pre-merge check listed in packet `required_checks` fails
- Ambiguity → default stop (same as rubric's "default to review manually")

**Auto path only** (`effectiveExecutionAuthority === "unchanged"`):

- Any item in `triggered_human_required` (non-empty list)
- Packet `stop: true`
- Policy YAML denies the `risk_class` or `merge_authority`

**Investigation-approved path only** (`effectiveExecutionAuthority === "investigation_approved_merge"`):

- `evaluateTriggeredStops` returns `stop: true` (non-overridable `stop_causes` remain)
- Do **not** stop based on raw `triggered_human_required` or packet `stop: true` alone — structured `stop_causes` are the authoritative policy input

---

## Forbidden

- Approving without merge
- Commenting on PR unless explicitly requested
- Batch-merging multiple PRs in one run without a per-PR run report

---

## Copy/paste prompt

### Auto path (default)

Paste as plain text in a fresh Agent-mode chat. Replace `{N}` and insert packet YAML between the markers.

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

After human audits the investigation report from [renovate-investigator](../.cursor/skills/renovate-investigator/SKILL.md):

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

---

## References

- Skill: [renovate-maintainer SKILL.md](../.cursor/skills/renovate-maintainer/SKILL.md)
- Classifier: [renovate-classifier SKILL.md](../.cursor/skills/renovate-classifier/SKILL.md)
- Investigator: [renovate-investigator SKILL.md](../.cursor/skills/renovate-investigator/SKILL.md)
- Packet schema: [packet-schema.md](../.cursor/skills/renovate-classifier/packet-schema.md)
- Policy: consumer `.agents/renovate-policy.yml` (template: [renovate-policy.template.yml](renovate-policy.template.yml))
- Guardrails: [scripts/lib/renovate-guardrails.ts](../scripts/lib/renovate-guardrails.ts)
- Run report template: [templates/renovate-run-report.md](templates/renovate-run-report.md)
