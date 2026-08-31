# Renovate investigator agent

Executor prompt for investigation-eligible Renovate evidence gathering (`high_touch_tooling` or `unlisted_package` with only overridable classifier stops; investigation-approved execution remains restricted to dependency-only allowed paths). Consumes a classifier execution packet from [renovate-classifier](../.cursor/skills/renovate-classifier/SKILL.md) and writes a gitignored investigation report from [templates/renovate-investigation-report.md](templates/renovate-investigation-report.md).

**Read-only GitHub:** investigation re-fetches PR evidence in normal and **`chat only`** modes but does not merge, approve, comment, or update branches.

Unlike the maintainer agent, this executor has **no merge authority** and never invokes `--approved`.

---

## Quick start

1. Run `/renovate-classifier` and confirm the packet is investigation-eligible (`human_required`, `merge_authority: denied`, overridable `stop_causes` only).
2. Open a **fresh Agent-mode chat**.
3. Paste the [copy/paste prompt](#copypaste-prompt) with the classifier packet YAML.
4. Default invocation writes `.agent-runs/renovate/{YYYY-MM-DD}-pr-{N}-investigation.md` and emits a production-executable overlay in chat when verdict is `ready_for_human_merge` (**normal** mode only).

Operator context: four-step evidence model in [investigation-checklist.md](../.cursor/skills/renovate-investigator/investigation-checklist.md).

---

## Input

- Classifier execution packet YAML (per [packet-schema.md](../.cursor/skills/renovate-classifier/packet-schema.md))
- Optional modifier: `chat only` — chat summary only; no report; no executable overlay
- Optional modifier: `fixture verification` — offline vitest #402 shape check; see skill [Invocation modes](../.cursor/skills/renovate-investigator/SKILL.md#invocation-modes)

---

## Responsibilities (ordered)

Execute per [renovate-investigator SKILL.md](../.cursor/skills/renovate-investigator/SKILL.md):

1. **Preflight** — GitHub MCP or `gh` read-only for normal/chat only; fixture verification may use mocked live evidence
2. **Eligibility** — `evaluateInvestigationEligibility(packet, policy)`; on failure, verdict `not_eligible` and halt investigation (skip four-step work and overlay)
3. **Freshness binding** — live re-fetch (normal/chat only) or mocked live fixture (fixture verification); on drift, verdict `stale_packet` and halt investigation
4. **Four-step investigation** — [investigation-checklist.md](../.cursor/skills/renovate-investigator/investigation-checklist.md)
5. **Verdict** — [investigation-rubric.md](../.cursor/skills/renovate-investigator/investigation-rubric.md)
6. **Report** — fill template; write to `.agent-runs/renovate/{YYYY-MM-DD}-pr-{N}-investigation.md` in normal and fixture verification only
7. **Handoff** — production-executable overlay in **normal** when `ready_for_human_merge`; `verification_only` + `expected_overlay` in **fixture verification** only

**Report write rules:**

- **Normal / fixture verification:** write gitignored report even when verdict is not `ready_for_human_merge` (including `not_eligible` and `stale_packet` — minimal report with verdict and next action)
- **`chat only`:** no report file (including gate failures — chat summary only)
- **Hard stop (no report / no verdict):** GitHub MCP and `gh` both unavailable in **normal** or **`chat only`** mode at preflight

---

## Stop conditions (hard)

- GitHub MCP and `gh` both unavailable at preflight in **normal** or **`chat only`** mode → stop; no report in normal; in **`chat only`**, emit availability error in chat only (no investigation verdict)
- Any merge, approve, comment, or branch-update tool called → stop; report partial findings if already written

**Gate halts (report when report mode applies):** `not_eligible`, `stale_packet` — skip four-step investigation and overlay; write minimal report in normal/fixture verification, chat summary only in `chat only`.

**Not hard stops:** `inconclusive`, `needs_migration`, `custom_risk_unresolved` — write full report with verdict and next actions when report mode applies.

---

## Forbidden

- `merge_pull_request`, `gh pr merge`, `gh pr review`, `gh pr close`, `gh pr update-branch`
- Rewriting packet `classification.merge_authority` or `stop_causes`
- Invoking maintainer or passing `--approved`
- Committed investigation reports or any repo file writes **outside** `.agent-runs/renovate/`
- Executable overlay during `chat only` or **fixture verification** (report may exist but overlay must not be production-shaped at top level)

**Allowed (Tier 1):** one gitignored markdown report per run under `.agent-runs/renovate/{YYYY-MM-DD}-pr-{N}-investigation.md` (normal and fixture verification).

---

## Copy/paste prompt

Paste as plain text in a fresh Agent-mode chat. Replace `{N}` and insert packet YAML between the markers.

```
@.agents/renovate-investigator.md

Investigate PR #{N} using the classifier packet below.
Follow renovate-investigator SKILL.md, investigation-checklist.md, and investigation-rubric.md.
Write the investigation report to .agent-runs/renovate/{date}-pr-{N}-investigation.md using .agents/templates/renovate-investigation-report.md.
When verdict is ready_for_human_merge, emit the production-executable declarative execution overlay YAML in chat (normal invocation only).
Do not merge. Do not approve or comment on the PR. Do not invoke maintainer.

---BEGIN PACKET---
(paste classifier execution packet YAML)
---END PACKET---
```

### Fixture verification (vitest #402 shape)

Offline operator verification — writes report; emits `verification_only` + `expected_overlay`; does **not** re-fetch live PR #402; **not** for maintainer handoff.

```
@.cursor/skills/renovate-investigator/SKILL.md

fixture verification
Investigate using scripts/fixtures/renovate-packets/high-touch-patch-investigate.yaml as the classifier packet (vitest #402 shape).
Use scripts/fixtures/renovate-packets/high-touch-patch-investigate-live.yaml as mocked live evidence.
Write report to .agent-runs/renovate/2026-07-15-pr-402-investigation.md.
Emit verification_only expected_overlay only — not a production-executable overlay.
Do not merge. Do not invoke maintainer. Do not re-fetch live PR #402.
```

---

## References

- Skill: [renovate-investigator SKILL.md](../.cursor/skills/renovate-investigator/SKILL.md)
- Checklist: [investigation-checklist.md](../.cursor/skills/renovate-investigator/investigation-checklist.md)
- Rubric: [investigation-rubric.md](../.cursor/skills/renovate-investigator/investigation-rubric.md)
- Verification: [verification.md](../.cursor/skills/renovate-investigator/verification.md)
- Classifier: [renovate-classifier SKILL.md](../.cursor/skills/renovate-classifier/SKILL.md)
- Policy: consumer `.agents/renovate-policy.yml` (template: [renovate-policy.template.yml](renovate-policy.template.yml))
