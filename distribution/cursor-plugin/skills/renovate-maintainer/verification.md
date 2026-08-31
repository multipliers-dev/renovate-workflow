# Renovate maintainer verification checklist

Manual checks for **renovate-maintainer** auto path and **`--approved`** investigation-approved path.

Automated authority derivation: [`scripts/renovate-guardrails.test.ts`](node_modules/renovate-workflow/scripts/renovate-guardrails.test.ts) (`evaluateEffectiveExecutionAuthority`).

## Prerequisites

- GitHub MCP or authenticated `gh` with merge access
- Policy v2 with `execution_modes.investigation_approved` in [`.agents/renovate-policy.yml`](../../../.agents/renovate-policy.yml)
- Classifier packet fixture: [`scripts/fixtures/renovate-packets/high-touch-patch-investigate.yaml`](node_modules/renovate-workflow/scripts/fixtures/renovate-packets/high-touch-patch-investigate.yaml)

## 1. Auto path — denied packet stops

Using a high-touch packet (`merge_authority: denied`, `stop: true`) **without** overlay or `--approved`:

- [ ] Maintainer stops at triggered-stops / merge-authority gate
- [ ] Run report records `effective_execution_authority: unchanged` or merge not attempted
- [ ] `human_approval_modifier` is null / absent
- [ ] No merge

## 2. Pairing gate — overlay without `--approved`

Pass overlay YAML with `execution_mode: investigation_approved` but invoke **without** `--approved`:

- [ ] Hard stop before merge
- [ ] Run report records stop rationale (overlay without modifier)
- [ ] No merge

## 3. Pairing gate — `--approved` without overlay

Invoke `/renovate-maintainer --approved` with classifier packet only:

- [ ] Hard stop before merge
- [ ] Run report records stop rationale (modifier without overlay)
- [ ] No merge

## 4. Investigation-approved path — fixture authority derivation

Using `high-touch-patch-investigate.yaml` packet shape + valid overlay + `--approved` (dry-run or chat-only reasoning against `evaluateEffectiveExecutionAuthority`):

- [ ] `effective_execution_authority: investigation_approved_merge`
- [ ] `original_merge_authority: denied`
- [ ] `human_approval_modifier: --approved`
- [ ] `suppressed_stop_causes` includes `decision_human_required`, `stop_flag_expected_human_required`, `triggered_runtime_behavior_affected_sole`

## 5. Investigation-approved path — live merge (when eligible PR exists)

After a **normal** [renovate-investigator](../renovate-investigator/SKILL.md) run with `ready_for_human_merge`:

- [ ] Fresh chat: `/renovate-maintainer --approved` with classifier packet + overlay
- [ ] Investigation report file exists at `overlay.investigation.report_path`
- [ ] Run report records authority fields
- [ ] Merge proceeds only when CI and pre-merge checks pass

## 6. Run report fields

Every maintainer run (auto or approved):

- [ ] `original_merge_authority` recorded
- [ ] `effective_execution_authority` recorded (`unchanged` | `investigation_approved_merge` | `denied`)
- [ ] `human_approval_modifier` recorded (`--approved` or null)

## 7. Merge method (docs / mutation command)

Static consistency when editing merge instructions (no live merge required):

- [ ] Maintainer agent § Merge and skill Mutation command use `gh pr merge --merge` (merge commit)
- [ ] Docs forbid `--squash` and `--rebase` (repo settings disable both)
- [ ] `docs/renovate-workflow.md` and `AGENTS.md` (Tool selection + Pull request workflow) match the same repo-wide merge-commit-only rule
