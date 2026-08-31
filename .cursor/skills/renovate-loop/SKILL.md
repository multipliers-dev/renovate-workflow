---
name: renovate-loop
description: >-
  Orchestrates repeated classify → route → execute cycles for open Renovate PRs by
  delegating to renovate-classifier, renovate-investigator (investigation lane), or
  renovate-maintainer (auto merge path). Use when the user asks for renovate loop,
  batch renovate processing, or /renovate-loop.
disable-model-invocation: true
---

# Renovate loop orchestration

Thin **Tier 3 boundary** orchestrator: repeatedly process open Renovate PRs until the queue is clear, blocked, or the iteration fuse trips. **Orchestration only** — no combined classifier/executor, no Phase 6 external automation.

**Delegation (mandatory):**

| Phase        | Owner                                                              | Responsibility                                                                                                                                            |
| ------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classify     | [renovate-classifier](../renovate-classifier/SKILL.md)             | Queue discovery (active non-draft set), FIFO selection, freshness, packet                                                                                 |
| Investigate  | [renovate-investigator](../../../.agents/renovate-investigator.md) | Evidence gathering for investigation-eligible high-touch and unlisted_package packets (overridable stops only; dependency-only paths gate approved merge) |
| Execute auto | [renovate-maintainer](../../../.agents/renovate-maintainer.md)     | Re-verify, merge when policy + CI allow, run report                                                                                                       |

**Active queue / FIFO:** the classifier constructs an **active queue with drafts removed**, then selects the lowest PR from that queue. The loop must consume the classifier’s active queue as returned and must **not** independently filter, include, or reconsider draft PRs. Parked-draft readiness triage is orthogonal via [renovate-draft-readiness](../renovate-draft-readiness/SKILL.md) and must not be folded into loop iterations.

**Investigation lane:** when a packet is `stop: true` but investigation-eligible per [`evaluateInvestigationEligibility`](../../../scripts/lib/renovate-investigation-eligibility.ts), delegate to renovate-investigator instead of stopping at `classifier_stop`. The loop **stops after investigation** — human reviews the report, then runs `/renovate-maintainer --approved` in a **fresh chat** (loop never passes `--approved`).

**Forbidden in this skill:**

- Merge, approve, or comment on PRs from the orchestrator
- PR selection during the maintainer phase
- Independently filtering, including, or reconsidering draft Renovate PRs (classifier owns active-queue construction)
- Reusing packets across iterations
- Modifying classifier or maintainer rules inline
- Skipping re-classify because prior `queue_remaining` "looks" valid
- Skipping main sync because "we just merged"
- Passing iteration N's packet into iteration N+1

Manual ladder reference: [docs/renovate-workflow.md](../../../docs/renovate-workflow.md). Verification checklist: [verification.md](verification.md).

## Governance

**Tier:** Tier 3 boundary — orchestrates Tier 0 classifier + investigator + maintainer delegates; may trigger maintainer merges via delegation only (auto path)

**State changed:**

- `.agent-runs/renovate/loop-{YYYY-MM-DD}.md` — loop summary (gitignored; append per iteration)
- Maintainer per-PR reports at `.agent-runs/renovate/{YYYY-MM-DD}-pr-{N}.md` (written by maintainer, not orchestrator)
- Investigator reports at `.agent-runs/renovate/{YYYY-MM-DD}-pr-{N}-investigation.md` (written by investigator, not orchestrator)
- Local `main` checkout synced to `origin/main` each iteration (git only; no remote mutations from orchestrator)
- Forbidden: orchestrator merge/approve/comment; packet persistence across sessions; parallel iterations; post-merge CI from orchestrator (maintainer owns that)

**Default behavior:**

- Loop invariant → classify → route (maintainer auto path | investigator | hard stop) → continue only on successful completed auto-path merge → repeat

**Mutation command:**

- Default invocation runs the full loop (classify → route → maintainer auto path or investigation lane per iteration until stop)
- `--babysit` — modifier for the normal loop only; remains attached through bounded post-update GitHub settling and required PR CI completion after a successful behind-branch update
- `dry-run` — one classify iteration only; report routing (maintainer auto path, investigation lane, or hard stop); **do not** invoke maintainer or investigator; **do not** start a second iteration

**Evidence gate:**

- Each iteration uses a **fresh** packet from the current `/renovate-classifier` run only
- Maintainer preflight gates (`head_sha`, `policy_version`, `BEHIND`) remain the backup stale-packet defense

**Evidence invalidation:**

- Any maintainer stop, investigator completion, classifier hard stop, or fuse trip invalidates the current iteration; discard packet; operator re-runs `/renovate-loop` fresh — do not resume mid-loop with a saved packet

**Override:**

- None. No `force apply` or bypass of stop table or maintainer hard stops.

**Audit trail:**

- Append each iteration to `.agent-runs/renovate/loop-{YYYY-MM-DD}.md` (create on first write)
- Per-iteration fields: iteration number, `main` SHA after sync, `selected_pr`, packet `head_sha`, classifier outcome, `delegate` (`maintainer` | `investigator` | `—`), delegate outcome, stop tag if stopped
- When `--babysit` is enabled, also record the `renovate-freshness-poll` helper result: terminal `outcome`, `freshnessRechecks`, `ciPolls`, `elapsedMs`, and any diagnostic `mergeState`, `ciState`, `observedHeadSha`, or `detail`

**Verification:**

- [verification.md](verification.md)

## Loop invariant (normative)

At the **start of every iteration** (including iteration 1):

1. Ensure the local view of `main` matches `origin/main`.
2. Discard any prior queue, packet, and merge-state assumptions from earlier iterations.

Then classify. **Do not** reuse iteration N data in iteration N+1.

**Main sync (implementation detail):**

Preflight — **stop** if the worktree is not clean (uncommitted or unstaged tracked changes would be destroyed by reset):

```bash
git status --porcelain
```

If output is non-empty → stop with report tag `dirty_worktree`; tell the operator to commit, stash, or discard local changes, then re-run `/renovate-loop`.

When clean:

```bash
git fetch origin
git checkout main
git reset --hard origin/main
```

Record `main` SHA after sync in the loop summary (`git rev-parse origin/main`).

## Task

Process open Renovate PRs in a loop:

1. Apply loop invariant (sync `main`, discard prior state).
2. Run [renovate-classifier](../renovate-classifier/SKILL.md) **exactly** (follow that skill; do not inline classifier logic). If the user invoked `/renovate-loop --babysit`, pass that modifier to the classifier so §2.7 can invoke the tested freshness helper after a successful behind-branch update.
3. Evaluate stop table and **route** the packet (§ below) — pre-packet hard stops first; for `stop: true` packets evaluate **G → F1 → F2** using mandatory `evaluateInvestigationEligibility` (F1 before F2); maintainer auto path last.
4. If `dry-run`: log classify outcome (including full FIFO queue overview from the classifier); report routing:
   - **Maintainer auto path** (`stop: false`) → note maintainer would run; stop tag `dry_run_complete`
   - **Investigation lane** (row F1) → note investigator would run; stop tag `investigation_complete`
   - **Hard stop** (rows A–E, B2, C, D, E, G, F2) → use the matching stop tag from step 3 (evaluate **G before F2** so `defer` packets get tag `defer`, not `classifier_stop`)
   - **Do not** invoke maintainer or investigator. Dry-run never starts iteration 2.
5. If not `dry-run` and **maintainer auto path** (`stop: false`): invoke [renovate-maintainer](../../../.agents/renovate-maintainer.md) **exactly** with **this iteration's packet only** (follow agent doc; do not inline maintainer logic).
6. If not `dry-run` and **investigation lane** (row F1): invoke [renovate-investigator](../../../.agents/renovate-investigator.md) **exactly** with **this iteration's packet only** (follow agent doc; do not inline investigator logic). **Stop the loop** after investigator completes — human gate is manual (`/renovate-maintainer --approved` in a fresh chat; loop never passes `--approved`).
7. If not `dry-run` and **hard stop** (rows A–E, B2, C, D, E, G, F2 from step 3; evaluate **G before F2**): **stop the loop** — log the matching stop tag; do not invoke maintainer or investigator; do not start the next iteration.
8. **Continue rule (default loop only):** start the next iteration **only** when renovate-maintainer reports a successful **completed** merge outcome on the **auto path** (maintainer runs post-merge checks; orchestrator does not). Investigation-lane and hard-stop iterations never continue the loop. If maintainer reports `post_merge_ci_failed` or **any** stop, stop the loop.
9. Discard the packet after each maintainer or investigator attempt (success or stop).
10. Repeat steps 1–10 until a stop condition fires or the iteration fuse trips.

**One PR per iteration.** No parallel iterations.

## Iteration safety fuse

Hard cap: **10 completed iterations** per **default** `/renovate-loop` invocation (classify + route cycles). When exceeded → stop with report tag `iteration_fuse`.

Count an iteration when loop invariant + classify step runs. Do not start iteration 11. **`dry-run` is always one iteration** and does not use the fuse.

## Dry-run

| Invocation                 | Behavior                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/renovate-loop`           | Full loop: classify → route → maintainer (auto path) or investigator (investigation lane) per iteration until stop                                                                                      |
| `/renovate-loop --babysit` | Normal full loop plus bounded post-update GitHub settling and required PR CI completion after a successful behind-branch update; does not define a separate workflow                                    |
| `/renovate-loop dry-run`   | **One** iteration: loop invariant + classify; no maintainer or investigator; no babysit rechecks; routing tag `dry_run_complete`, `investigation_complete`, or classifier stop tags A–G when applicable |

`--babysit` is supported only with the normal loop invocation. No `classify-only` alias in v1.

## Routing (after classify)

Evaluate in order after a packet is emitted:

1. **Pre-packet / pre-delegation stops** — rows A, B, B2, C, D, E (no packet to route).
2. **Row G (`defer`)** — `classification.decision === defer` → hard stop tag `defer`.
3. **Investigation lane (F1)** — when `stop: true`, run [`evaluateInvestigationEligibility`](../../../scripts/lib/renovate-investigation-eligibility.ts) **mandatory** (no heuristics). `eligible: true` → route to renovate-investigator; loop stops after investigation (human gate).
4. **Classifier hard stop (F2)** — when `stop: true` and step 3 returned `eligible: false` → hard stop tag `classifier_stop`. **Do not** classify F2 without running the helper in step 3.
5. **Maintainer auto path** — `stop: false` (`auto_merge_eligible` or `agent_review_required`). Route to renovate-maintainer; loop may continue after successful merge.

**Never** route `stop: true` packets to maintainer without `--approved` + investigation overlay (maintainer auto path is `stop: false` only).

## Maintainer handoff (auto path)

For each non–dry-run iteration on the **maintainer auto path**, follow the maintainer agent and its [copy/paste prompt](../../../.agents/renovate-maintainer.md#copypaste-prompt). Pass only the YAML packet from **this** classify run.

The orchestrator **waits** for the maintainer's final report. It does **not** run post-merge CI itself.

## Investigator handoff (investigation lane)

For each non–dry-run iteration on the **investigation lane** (row F1), follow the investigator agent and its [copy/paste prompt](../../../.agents/renovate-investigator.md#copypaste-prompt). Pass only the YAML packet from **this** classify run.

The orchestrator **waits** for the investigator's final report. It does **not** invoke maintainer, pass `--approved`, or continue the loop. Tell the operator to audit the investigation report and, when ready, open a **fresh chat** with `/renovate-maintainer --approved` + packet + overlay (see [renovate-maintainer SKILL.md](../renovate-maintainer/SKILL.md)).

## Loop summary format

Append to `.agent-runs/renovate/loop-{YYYY-MM-DD}.md`:

```markdown
# Renovate loop — {YYYY-MM-DD}

| Iteration | main_sha_after_sync | selected_pr | packet_head_sha | classifier | delegate     | outcome        | stop_tag               | babysit  |
| --------- | ------------------- | ----------- | --------------- | ---------- | ------------ | -------------- | ---------------------- | -------- |
| 1         | abc1234             | 412         | def5678         | packet     | maintainer   | merged         | —                      | disabled |
| 2         | fedcba9             | 418         | aaa1111         | packet     | investigator | report_written | investigation_complete | disabled |
```

`delegate` is `maintainer`, `investigator`, or `—` when stopped before delegation. `outcome` is maintainer merge result, investigator verdict, or `—`.

Include a final **Loop outcome** line: `completed` (queue empty after auto-path merge), `stopped` (tag + PR if applicable), `iteration_fuse` (default loop only), `dry_run_complete` (dry-run auto path), or `investigation_complete` (dry-run investigation lane or post-investigation stop).

When `--babysit` is enabled, the `babysit` cell should include the helper's terminal outcome (`clean`, `unknown_exhausted`, `budget_exhausted`, `merge_query_failed`, `ci_query_failed`, `ci_failed`, `non_clean`, or `head_changed`), freshness recheck count, CI poll count, and elapsed time. Use `enabled_not_triggered` when the modifier was enabled but no post-update helper invocation occurred.

## Classifier freshness stop output

When the loop stops with tag `classifier_freshness_stop` and merge state was pre-update `UNKNOWN`, echo in chat (in addition to the loop summary):

- **Loop outcome** line: `stopped` — tag `classifier_freshness_stop` on PR #{N}
- **Babysit** (when `--babysit` was active): `Babysit: enabled but not triggered (freshness gate stopped before branch update)` — babysit cell `enabled_not_triggered`
- Pointer to the classifier's **What to do next (mergeStateStatus: UNKNOWN)** block
- Explicit note: the loop did not merge, approve, or comment on any PR

## Stopping conditions

### Stop before delegation (orchestrator — no merge attempted)

| #   | Condition                                                                                                                                                        | Source                   | Report tag                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| A   | Zero active (non-draft) Renovate PRs after discovery — including when only draft Renovate PRs remain                                                             | classifier §2            | `queue_empty`                                                                                                |
| B   | Classifier preflight failure (no MCP / `gh`)                                                                                                                     | classifier §0            | `github_unavailable`                                                                                         |
| B2  | Worktree not clean before main sync (`git status --porcelain` non-empty)                                                                                         | orchestrator preflight   | `dirty_worktree`                                                                                             |
| C   | Explicit PR not in active Renovate set (missing, non-Renovate, or draft)                                                                                         | classifier §2.5          | `invalid_target_pr`                                                                                          |
| D   | Classifier freshness stop before packet (`BLOCKED`, `DIRTY`, `UNKNOWN`, branch-update failure, readonly MCP + `BEHIND`, or non-clean `--babysit` helper outcome) | classifier §2.6–§2.7     | `classifier_freshness_stop`                                                                                  |
| E   | No YAML execution packet emitted                                                                                                                                 | classifier failure modes | `no_packet`                                                                                                  |
| G   | Recommendation / handoff is `defer` (`classification.decision: defer`)                                                                                           | classifier §5 handoff    | `defer`                                                                                                      |
| F1  | Packet `stop: true` **and** `evaluateInvestigationEligibility` returns `eligible: true` (**mandatory** when `stop: true`, after G)                               | policy + packet-schema   | `investigation_complete` (dry-run) or delegate to investigator (normal loop; loop stops after investigation) |
| F2  | Packet `stop: true` **and** `evaluateInvestigationEligibility` returns `eligible: false` (after G; helper mandatory — no heuristics)                             | packet-schema.md         | `classifier_stop`                                                                                            |
| H   | Iteration safety fuse exceeded                                                                                                                                   | orchestrator fuse        | `iteration_fuse`                                                                                             |
| I   | Operator `dry-run` on maintainer auto path (`stop: false`)                                                                                                       | orchestrator modifier    | `dry_run_complete`                                                                                           |

### Stop after maintainer (merge not completed)

Any maintainer hard stop from [renovate-maintainer.md § Stop conditions](../../../.agents/renovate-maintainer.md): `policy_version_drift`, `stale_packet`, `base_behind`, `triggered_human_required`, `watch_condition_confirmed`, `pre_merge_check_failed`, `merge_authority_denied`, `decision_stop`, `ambiguous_stop`, `merge_failed`, `post_merge_ci_failed`.

### Continue loop (only case)

Continue **only** after renovate-maintainer reports a successful **completed** merge outcome (including required post-merge checks). If the maintainer reports `post_merge_ci_failed` or any other stop, **stop the loop**.

## Avoiding stale packets between iterations

| Rule                              | Mechanism                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh local `main` each iteration | Loop invariant: local `main` matches `origin/main` before classify                                                                                            |
| Babysit polling stays scoped      | Freshness and CI polling occur inside the same classification attempt; they do not restart the queue iteration, reset the worktree, or reselect the FIFO head |
| Never reuse packets               | Orchestrator holds at most one packet; discard after each maintainer or investigator attempt                                                                  |
| Re-classify after every merge     | Always run full `renovate-classifier` (fresh discovery, freshness gate, new `head_sha` / `policy_version`)                                                    |
| FIFO on fresh base                | Classifier picks lowest PR from the active (non-draft) queue against current `main`                                                                           |
| Maintainer as backup              | Existing preflight + pre-merge `head_sha` / `BEHIND` / `policy_version` gates                                                                                 |
| No parallel iterations            | One PR per iteration                                                                                                                                          |
| Iteration log records SHAs        | Loop summary logs `selected_pr`, packet `head_sha`, merge result, and `main` SHA after sync                                                                   |

If maintainer stops with `stale_packet` or `base_behind`, stop the loop; operator re-runs `/renovate-loop` fresh.

## Authority boundaries

| Actor                     | May                                                                     | Must not                                                               |
| ------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **renovate-loop**         | Sync local `main`; delegate classify/route/execute; append loop summary | Merge; select PRs; reuse packets; run post-merge CI; pass `--approved` |
| **renovate-classifier**   | Discover queue; FIFO select; freshness; emit packet with `stop_causes`  | Merge; approve; comment; close                                         |
| **renovate-investigator** | Gather evidence; write investigation report; emit overlay when ready    | Merge; approve; comment; pass `--approved`                             |
| **renovate-maintainer**   | Re-verify packet; merge when gates pass; per-PR run report              | Select queue; classify without packet                                  |

Merge authority stays with renovate-maintainer under existing [renovate-policy.yml](../../../.agents/renovate-policy.yml) gates — this orchestrator does **not** expand merge authority.

## References

- Classifier: [renovate-classifier/SKILL.md](../renovate-classifier/SKILL.md)
- Investigator: [renovate-investigator.md](../../../.agents/renovate-investigator.md)
- Investigation eligibility: [renovate-investigation-eligibility.ts](../../../scripts/lib/renovate-investigation-eligibility.ts)
- Maintainer: [renovate-maintainer.md](../../../.agents/renovate-maintainer.md)
- Packet schema: [packet-schema.md](../renovate-classifier/packet-schema.md)
- Operator runbook: [docs/renovate-workflow.md](../../../docs/renovate-workflow.md)
- Maintainer run report template: [renovate-run-report.md](../../../.agents/templates/renovate-run-report.md)
