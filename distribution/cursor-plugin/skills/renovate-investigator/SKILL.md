---
name: renovate-investigator
description: >-
  Gathers four-step evidence for investigation-eligible high-touch and
  unlisted_package Renovate PRs (overridable classifier stops only);
  writes gitignored investigation report and declarative execution overlay handoff.
  Investigation-approved execution remains restricted to dependency-only allowed paths.
  No merge authority. Use for renovate investigation, high-touch evidence packet,
  unlisted package investigation, or /renovate-investigator.
disable-model-invocation: true
---

# Renovate investigator

Evidence-gathering lane for **investigation-eligible** Renovate PRs (`high_touch_tooling` or `unlisted_package` with only overridable classifier stops). Consumes a classifier execution packet, runs the four-step checklist, writes one gitignored investigation report, and emits a declarative execution overlay when verdict is `ready_for_human_merge`. Investigation-approved execution remains restricted to dependency-only `allowed_paths`.

**Tier 1 workflow:** GitHub read-only; one local audit report under `.agent-runs/renovate/` (never committed). **No merge authority.**

Supporting docs: [investigation-checklist.md](investigation-checklist.md), [investigation-rubric.md](investigation-rubric.md), [verification.md](verification.md).

## Invocation modes

Three modes — do not mix semantics across them.

| Mode                       | Trigger                                    | GitHub re-fetch                                  | Report write     | Overlay                                                                              |
| -------------------------- | ------------------------------------------ | ------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------ |
| **Normal** (default)       | classifier packet from a live classify run | **Required** — live `head_sha` must match packet | Yes              | Executable when `ready_for_human_merge`                                              |
| **`chat only`**            | user says `chat only`                      | Required when packet references a live PR        | **No**           | **No** — optional `PREVIEW ONLY` block, not for maintainer handoff                   |
| **`fixture verification`** | user says `fixture verification`           | **Skipped** — use mocked live evidence fixture   | Yes (gitignored) | **No** — `verification_only: true` + `expected_overlay` when `ready_for_human_merge` |

### Normal invocation

Default production path after `/renovate-classifier`. Re-fetch live PR; `stale_packet` when live `head_sha` ≠ `packet.pr.head_sha`.

### `chat only`

Analysis and verdict in chat only. Do **not** write a report file. Do **not** emit an executable overlay (`report_path` would point at a missing file). Use a **live classifier packet** whose `pr.head_sha` matches the open PR — do **not** use committed fixture packets (placeholder `cafebabe…` head SHAs); use **`fixture verification`** for offline packet-shape checks instead. If helpful, show an overlay-shaped block labeled:

```markdown
### PREVIEW ONLY — not for maintainer handoff

(chat only mode; no report file written)
```

### `fixture verification`

Operator/CI verification for the vitest #402 packet **shape** without depending on live PR #402 state.

1. Packet: [`scripts/fixtures/renovate-packets/high-touch-patch-investigate.yaml`](node_modules/renovate-workflow/scripts/fixtures/renovate-packets/high-touch-patch-investigate.yaml)
2. Mocked live evidence: [`scripts/fixtures/renovate-packets/high-touch-patch-investigate-live.yaml`](node_modules/renovate-workflow/scripts/fixtures/renovate-packets/high-touch-patch-investigate-live.yaml)
3. **Do not** call GitHub for stale-packet binding — treat mocked live `pr.head_sha` as authoritative and require it to equal `packet.pr.head_sha`
4. Four-step investigation uses packet `evidence` plus repo-local grep/config analysis (no live PR body fetch required for pass/fail of the verification contract)
5. Write gitignored report; when verdict is `ready_for_human_merge`, emit **`verification_only: true`** with nested **`expected_overlay`** in chat — **not** a production-executable overlay
6. Label the report header and chat summary: `fixture verification — not a live PR run`
7. **Do not** include human-gate maintainer handoff instructions (no `/renovate-maintainer --approved` from fixture output)

**Do not** label `fixture verification` as `dry-run` or `chat only`.

## Governance

**Tier:** Tier 1 — GitHub read-only; one gitignored local markdown report per run

**State changed:**

- `.agent-runs/renovate/{YYYY-MM-DD}-pr-{N}-investigation.md` only (never committed)
- Forbidden: PR merge/approve/comment; packet `merge_authority` mutation; `stop_causes` mutation; repo file commits; any path outside `.agent-runs/renovate/`; production-executable overlay from **fixture verification** or **`chat only`**

**Default behavior:**

- observe (packet + live PR re-fetch, or mocked live evidence in fixture verification) → analyze (four-step checklist) → report (fill template, write gitignored file in normal and fixture verification) → handoff (executable overlay in **normal** only when `ready_for_human_merge`; `expected_overlay` under `verification_only: true` in **fixture verification**)

**Mutation command:**

- Normal invocation — write report after investigation completes; executable overlay when `ready_for_human_merge`
- `fixture verification` — write gitignored report; `verification_only` + `expected_overlay` when `ready_for_human_merge`; use mocked live evidence (no GitHub stale check); **never** emit production-executable overlay
- `chat only` — no report file; no executable overlay

**Evidence gate:**

- Eligibility check via [`evaluateInvestigationEligibility`](node_modules/renovate-workflow/scripts/lib/renovate-investigation-eligibility.ts) before expensive analysis
- Normal: live `head_sha` and `policy_version` match packet at report write time for `ready_for_human_merge`
- Fixture verification: mocked live evidence `pr.head_sha` and `policy_version` match packet

**Evidence invalidation:**

- Normal: live `head_sha` drift → verdict `stale_packet`; no overlay
- Normal: `policy_version` drift → verdict `stale_packet`; no overlay
- Fixture verification: mocked live evidence mismatch vs packet → verdict `stale_packet`; no overlay
- Eligibility failure → verdict `not_eligible`; no overlay

**Override:**

- None for GitHub writes or merge; human gate is `/renovate-maintainer --approved` (separate slice)

**Audit trail:**

- Investigation report path in chat (normal and fixture verification); executable overlay YAML in **normal** only when verdict is `ready_for_human_merge`

**Verification:**

- See [verification.md](verification.md); fixture verification on vitest #402 shape

## Task

For one investigation-eligible classifier packet:

1. Validate eligibility and packet freshness
2. Run the [four-step checklist](investigation-checklist.md)
3. Assign verdict per [investigation-rubric.md](investigation-rubric.md)
4. Write investigation report from [`../../agents/templates/renovate-investigation-report.md`](../../agents/templates/renovate-investigation-report.md)
5. Emit handoff artifact in chat when verdict is `ready_for_human_merge` — executable overlay in **normal**; `verification_only` + `expected_overlay` in **fixture verification**

Re-run `/renovate-classifier` if the packet is stale. Human reviews the report, then invokes `/renovate-maintainer --approved` with packet + overlay (see [renovate-maintainer SKILL.md](../renovate-maintainer/SKILL.md)).

## Input

- Classifier **execution packet** YAML (per [packet-schema.md](../renovate-classifier/packet-schema.md))
- Optional: explicit PR number (must match packet `pr.number`)
- Optional modifier: `chat only` — chat summary only; no report; no executable overlay
- Optional modifier: `fixture verification` — offline vitest #402 shape check; see [Invocation modes](#invocation-modes)

## Steps

### 0. Preflight (GitHub MCP or `gh`)

1. **Normal / `chat only`:** confirm GitHub MCP or authenticated `gh` is available (read-only is sufficient). If both are unavailable, **hard stop** — no report in normal; availability error in chat only (no investigation verdict).
2. **`fixture verification`:** GitHub is optional — mocked live evidence substitutes PR re-fetch for freshness binding.
3. **Forbidden write tools:** `merge_pull_request`, `pull_request_review_write`, `update_pull_request`, `gh pr merge`, `gh pr review`, `gh pr close`, `gh pr update-branch`.
4. Read [`.agents/renovate-policy.yml`](../../../.agents/renovate-policy.yml) and [investigation-rubric.md](investigation-rubric.md).

### 1. Validate packet and eligibility

1. Parse the classifier packet YAML.
2. **Policy version** — `packet.policy_version` must equal live `renovate-policy.yml` `version` (or mocked `policy_version` in fixture verification). Mismatch → verdict `stale_packet`; **halt investigation** (skip steps 2–3 and overlay in step 5).
3. **Eligibility** — run `evaluateInvestigationEligibility(packet, policy)` (or equivalent reasoning per rubric). `eligible: false` → verdict `not_eligible`; **halt investigation** (skip steps 2–3 and overlay in step 5).
4. **Freshness binding:**
   - **Normal:** re-fetch live PR via GitHub MCP or `gh pr view --json headRefOid,mergeStateStatus,title,url`. Compare live `head.sha` to `packet.pr.head_sha`. Mismatch → verdict `stale_packet`; **halt investigation** (skip steps 2–3 and overlay in step 5).
   - **`fixture verification`:** load [`high-touch-patch-investigate-live.yaml`](node_modules/renovate-workflow/scripts/fixtures/renovate-packets/high-touch-patch-investigate-live.yaml) (or equivalent mocked live evidence supplied in prompt). Compare mocked `pr.head_sha` to `packet.pr.head_sha`. Mismatch → verdict `stale_packet`; **halt investigation** (skip steps 2–3 and overlay in step 5). **Do not** re-fetch live PR #402.
   - **`chat only`:** same binding rules as normal when a live packet is used; skip report write and executable overlay regardless of verdict.

**Early gate failures** (`not_eligible`, `stale_packet`):

- **`chat only`:** emit the **Eligibility** block and chat summary with verdict; end session (no report).
- **Normal / fixture verification:** emit the **Eligibility** block, then go to [step 4](#4-write-investigation-report) and write a **minimal report** (verdict, `eligibility_reason` or stale-packet note, instruction to re-run `/renovate-classifier` when stale); skip steps 2–3 and overlay in step 5.

Emit an **Eligibility** block in chat:

```markdown
## Investigation eligibility

- PR: #{N}
- Eligible: yes | no
- risk_class: {classification.risk_class}
- stop_causes: [{...}]
- Reason (if ineligible): …
```

### 2. Four-step investigation

Apply [investigation-checklist.md](investigation-checklist.md) in order. For each step, gather repo-specific evidence:

| Step               | Primary sources                                                                     |
| ------------------ | ----------------------------------------------------------------------------------- |
| 1. Upstream change | PR body release notes, package changelogs, semver bump                              |
| 2. Usage mapping   | Import grep, config files, `evidence.changed_files`                                 |
| 3. Custom risk     | Custom plugins, policy sensitive paths, `triggered_human_required`                  |
| 4. App validation  | PR CI (`gh pr checks` / `get_check_runs`), preview deploy when custom risk requires |

Re-fetch PR diff/files when packet evidence may be stale. Document **Sufficient / Partial / Insufficient** per step in the report.

### 3. Assign verdict

Per [investigation-rubric.md](investigation-rubric.md):

- All steps sufficient, custom risks resolved, changed files ⊆ `allowed_paths` → `ready_for_human_merge`
- Implementation work required → `needs_migration`
- Unresolved custom risk → `custom_risk_unresolved`
- Evidence gaps → `inconclusive`

Re-check freshness binding immediately before finalizing verdict (live re-fetch in normal; mocked live evidence in fixture verification).

### 4. Write investigation report

Write a report in **normal** and **`fixture verification`** modes only:

- Path: `.agent-runs/renovate/{YYYY-MM-DD}-pr-{N}-investigation.md`
- Template: [`../../agents/templates/renovate-investigation-report.md`](../../agents/templates/renovate-investigation-report.md)
- Create `.agent-runs/renovate/` on first write
- **`fixture verification`:** include `fixture verification — not a live PR run` in the report header
- **Gate failures** (`not_eligible`, `stale_packet`): minimal report is sufficient — verdict, reason, and next action (re-run `/renovate-classifier` when stale); four-step sections may be omitted or marked N/A

**`chat only`:** skip this step.

### 5. Execution overlay handoff

#### Normal (production-executable)

When verdict is `ready_for_human_merge` in **normal** invocation, emit one fenced YAML block in chat (declarative workflow input only — no `execution_authority` or `human_approval` fields):

```yaml
execution_mode: investigation_approved
investigation:
  report_path: .agent-runs/renovate/{YYYY-MM-DD}-pr-{N}-investigation.md
  verdict: ready_for_human_merge
  investigated_at: "{ISO8601}"
  investigation_head_sha: "{packet pr.head_sha}"
```

Include a **Human gate** note:

```markdown
## Human gate

1. Audit the investigation report at `{report_path}`.
2. In a fresh Agent-mode chat, invoke `/renovate-maintainer --approved` with the **classifier packet** and the **execution overlay** above.
3. Do not merge from this investigation session.
```

#### `fixture verification` (non-executable)

When verdict is `ready_for_human_merge` in **`fixture verification`**, emit a **verification artifact only** — never the production overlay shape at the top level:

```yaml
verification_only: true
invocation_mode: fixture_verification
expected_overlay:
  execution_mode: investigation_approved
  investigation:
    report_path: .agent-runs/renovate/{YYYY-MM-DD}-pr-{N}-investigation.md
    verdict: ready_for_human_merge
    investigated_at: "{ISO8601}"
    investigation_head_sha: "{packet pr.head_sha}"
```

Include an explicit boundary note:

```markdown
## Verification artifact — not for maintainer handoff

Synthetic mocked live evidence. Do **not** pass `expected_overlay` to `/renovate-maintainer --approved`.
Re-run a **normal** investigation on a live classifier packet to obtain a production-executable overlay.
```

Record the same `expected_overlay` under **Expected overlay (verification only)** in the gitignored report (not under **Execution overlay**).

For other verdicts, state next action (manual migration, re-classify, additional validation) without overlay or `expected_overlay`.

**`chat only`:** never emit an executable overlay or `expected_overlay`. Optional preview only per [Invocation modes](#invocation-modes).

## Failure modes

| Condition                            | Behavior                                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub MCP and `gh` both unavailable | Normal: stop; no report. **`chat only`:** stop; availability error in chat only (no investigation verdict). Fixture verification: may proceed. |
| Packet ineligible                    | Report with `not_eligible` when report mode applies; no overlay                                                                                |
| `head_sha` or `policy_version` drift | Report with `stale_packet` when report mode applies; no overlay                                                                                |
| Ambiguous evidence                   | Verdict `inconclusive`; no executable overlay                                                                                                  |
| `chat only`                          | Chat summary only; no report; no executable overlay                                                                                            |
| `fixture verification`               | Report + `verification_only` artifact; no production overlay                                                                                   |

## References

- Four-step model: [investigation-checklist.md](investigation-checklist.md)
- Classifier packet: [packet-schema.md](../renovate-classifier/packet-schema.md)
- Eligibility helper: [`scripts/lib/renovate-investigation-eligibility.ts`](node_modules/renovate-workflow/scripts/lib/renovate-investigation-eligibility.ts)
- Policy: consumer `.agents/renovate-policy.yml` (template: [`.agents/renovate-policy.template.yml`](../../agents/renovate-policy.template.yml))
- Agent: [`.agents/renovate-investigator.md`](../../agents/renovate-investigator.md)
- Report template: [`../../agents/templates/renovate-investigation-report.md`](../../agents/templates/renovate-investigation-report.md)
