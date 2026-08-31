# Execution packet schema (v1)

Machine-readable handoff from **renovate-classifier** (classifier) to the renovate maintainer agent (executor). The classifier emits YAML in fenced blocks; the executor reads this schema and the packet list in `required_checks` as authoritative.

**Policy sync note:** `classification.risk_class` values must match consumer `.agents/renovate-policy.yml` `risk_classes` buckets. Portable interpretation: [`.agents/policy-rubric.base.md`](../../agents/policy-rubric.base.md). Template: [`.agents/renovate-policy.template.yml`](../../agents/renovate-policy.template.yml).

---

## Batch envelope

Once per run, before the per-PR packet. The classifier emits **one** envelope and **one** per-PR packet per run.

```yaml
packet_version: "1"
repo: "{owner}/{repo}"
generated_at: "{ISO8601}"
selected_pr: 123 # PR analyzed this run (FIFO or explicit override; active set only)
queue_remaining: [124, 125] # other active (non-draft) Renovate PR numbers; [] when none
discovery:
  method: head-branch | author-search
  open_renovate_prs: [123, 124, 125] # active non-draft only
  skipped_non_renovate: 3
  skipped_draft: 1 # draft Renovate PRs excluded from active queue
  draft_renovate_prs: [436] # draft Renovate PR numbers; [] when none
```

`selected_pr` and `queue_remaining` are optional for backward compatibility with packets emitted before the single-PR workflow; new classifier runs should always include them. Both are drawn from the **active** (non-draft) set only.

---

## Per-PR packet

One packet per classifier run (the selected Renovate PR).

```yaml
policy_version: "3" # renovate-policy.yml version at classification time

base_freshness: # optional audit trail; maintainer re-fetches live mergeStateStatus at execute time
  base_branch: main
  base_sha: "abc..." # baseRefOid at classification time
  merge_state: CLEAN | BEHIND # post-§2.7 state when analysis proceeds
  branch_updated: false # true when §2.7 gh pr update-branch ran successfully

pr:
  number: 123
  title: "..."
  url: "https://github.com/{owner}/{repo}/pull/123"
  branch: renovate/...
  draft: false
  head_sha: "abc123..." # PR head commit at classification time

evidence_checked_at: "{ISO8601}" # when classifier last fetched PR evidence

classification:
  recommendation: merge | review_manually | defer # human-readable legacy label
  decision: auto_merge_eligible | agent_review_required | human_required | defer
  merge_authority: allowed | allowed_if_no_code_changes | denied
  risk_class: lockfile_patch | low_risk_tooling_patch | low_risk_tooling_major | github_action_pin_same_major | github_action_major | high_touch_tooling | runtime_dependency | analytics_or_telemetry | auth_or_security | sensitive_path_change | large_lockfile | unlisted_package | renovate_config_change
  risk_level: low | medium | high

evidence:
  packages: [{ name, from, to, bump: patch|minor|major, dep_kind: dev|runtime }]
  changed_files: ["package-lock.json", ...]
  pr_file_count: 0 # total files from get_files (PR-wide; used for files_over_30)
  package_count: 1 # number of packages bumped in PR (1 = single-package)
  lockfile_maintenance: true | false # Renovate lock file maintenance PR (see policy-rubric.base Lockfile impact)
  lockfile_delta:
    additions: 0
    deletions: 0
    lockfile_paths_changed: 0 # package-lock.json paths touched (not pr_file_count)
    line_delta_total: 0 # additions + deletions
    line_delta_limit: 800 | 2000 # 2000 when lockfile_maintenance: true; else 800
    within_threshold: true | false
    threshold_flags: [] # line_delta_over_limit | files_over_30 | maintenance_over_2000
  ci: { status: green|red|pending|unknown, blocking_check: "CI / test", details: "..." }
  release_note_flags: []
  sensitive_paths_touched: []
  workflow_changes: # hard gate when .github/workflows/*.yml touched
    files: [".github/workflows/ci.yml"]
    uses_pin_only: true | false # every diff hunk is a uses: version pin change only
    same_major_only: true | false # every pin bump stays within the same Action major (v6.x → v6.y)
  rubric_triggers: [] # e.g. "major_bump", "high_touch_package", "github_action_major", "ci_unknown"

required_checks:
  - pr_ci_green # always (pre-merge)
  - post_merge_main_ci_green # always (post-merge)
  # conditional — classifier adds ONLY when applicable (see Check assembly below):
  # - validate_renovate_config      # when renovate.json changed
  # - workflow_uses_pin_only        # when .github/workflows/*.yml changed
  # - lockfile_within_threshold     # when package-lock.json changed

human_required_if: # latent stop conditions — executor watches for these
  - implementation_changes_required
  - ci_failure_unexplained
  - runtime_behavior_affected

triggered_human_required: [] # conditions that already fired at classification time
  # e.g. ["runtime_behavior_affected"] — executor stops immediately

stop: false
stop_reason: null
stop_causes: [] # structured enum keys when stop: true — see Stop causes below
```

---

## Execution overlay (investigation-approved)

Declarative workflow input for the **investigation-approved maintainer path** (`/renovate-maintainer --approved`). Emitted by [renovate-investigator](../renovate-investigator/SKILL.md) when verdict is `ready_for_human_merge` — **not** part of the classifier packet.

**Required pairing:** overlay + invocation `--approved`. Maintainer hard-stops on mismatch.

**Overlay contains workflow inputs only** — no `execution_authority`, `human_approval`, or `merge_authority` fields. Authority is derived at execute time via `evaluateEffectiveExecutionAuthority` in [`scripts/lib/renovate-guardrails.ts`](node_modules/renovate-workflow/scripts/lib/renovate-guardrails.ts).

```yaml
execution_mode: investigation_approved
investigation:
  report_path: .agent-runs/renovate/{date}-pr-{N}-investigation.md
  verdict: ready_for_human_merge
  investigated_at: "{ISO8601}"
  investigation_head_sha: "{packet pr.head_sha at investigation time}"
```

| Field                                  | Required | Semantics                                                                    |
| -------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `execution_mode`                       | yes      | Must be `investigation_approved`                                             |
| `investigation.report_path`            | yes      | Gitignored investigation report; maintainer reads file before merge          |
| `investigation.verdict`                | yes      | Must match policy `requires_investigation_verdict` (`ready_for_human_merge`) |
| `investigation.investigated_at`        | yes      | ISO8601 timestamp from investigator run                                      |
| `investigation.investigation_head_sha` | yes      | Must equal packet `pr.head_sha` at execute time (stale overlay → stop)       |

**Classifier packet is immutable** — `classification.merge_authority: denied` is never rewritten on the packet. Maintainer may derive `effective_execution_authority: investigation_approved_merge` only with overlay + `--approved` + live gate satisfaction.

**Fixture verification artifact** (`verification_only: true` + `expected_overlay`) from investigator fixture mode is **not** a valid maintainer overlay — re-run normal investigation for production handoff.

---

## Stale packet detection

The classifier sets `head_sha` and `evidence_checked_at` from the PR at classification time (after any §2.7 branch update). The executor **must stop** (do not merge) if:

- the live PR `head.sha` differs from `head_sha` at **preflight** or **immediately before merge** (after steps 2–6 may re-fetch files/CI and take minutes), or
- live `mergeStateStatus` is `BEHIND` at **preflight** (e.g. a sibling Renovate PR merged and moved `main` after classification)

Re-run `/renovate-classifier` to refresh the packet. `base_freshness` on the packet is an audit trail only — the maintainer uses live merge state at execute time.

## Policy version drift

The classifier sets `policy_version` from `version` in [`.agents/renovate-policy.yml`](../../../.agents/renovate-policy.yml) at classification time. The executor **must stop** (do not merge) if `packet.policy_version` is missing or does not equal the live `renovate-policy.yml` `version` at **preflight** or **immediately before merge** (after steps 2–6 may re-read policy and take minutes) — re-run `/renovate-classifier` so the decision is made under current merge rules.

Bump `renovate-policy.yml` `version` when merge authority, `risk_classes`, or check semantics change; update the classifier and packet schema in the same PR.

---

## `risk_class` enum

Shared with `.agents/renovate-policy.yml`. The executor looks up the packet value directly — no secondary mapping.

| Value                          | Typical `decision`      | Typical `merge_authority`    |
| ------------------------------ | ----------------------- | ---------------------------- |
| `lockfile_patch`               | `auto_merge_eligible`   | `allowed`                    |
| `low_risk_tooling_patch`       | `auto_merge_eligible`   | `allowed`                    |
| `github_action_pin_same_major` | `auto_merge_eligible`   | `allowed`                    |
| `low_risk_tooling_major`       | `agent_review_required` | `allowed_if_no_code_changes` |
| `high_touch_tooling`           | `human_required`        | `denied`                     |
| `github_action_major`          | `human_required`        | `denied`                     |
| `runtime_dependency`           | `human_required`        | `denied`                     |
| `unlisted_package`             | `human_required`        | `denied`                     |
| `large_lockfile`               | `human_required`        | `denied`                     |
| `analytics_or_telemetry`       | `human_required`        | `denied`                     |
| `auth_or_security`             | `human_required`        | `denied`                     |
| `sensitive_path_change`        | `human_required`        | `denied`                     |
| `renovate_config_change`       | `human_required`        | `denied`                     |

Full rubric → packet mapping: [policy-rubric.base.md — Rubric outcome → packet fields](../../agents/policy-rubric.base.md#rubric-outcome--packet-fields).

---

## `human_required_if` vs `triggered_human_required`

- **`human_required_if`** — latent stop conditions the executor must watch for during inspection (not yet confirmed). Always include the full watch list for the PR's risk profile even when no triggers have fired yet.
- **`triggered_human_required`** — conditions that **already fired** at classification time. Populate from rubric triggers that are definitive now (e.g. sensitive path touched → `implementation_changes_required`; lockfile threshold exceeded → `lockfile_threshold_exceeded`; runtime dep bump → `runtime_behavior_affected`; CI red/unknown → `ci_failure_unexplained`).

When `triggered_human_required` is non-empty **or** `decision` is `human_required` or `defer`, set `stop: true`, `stop_reason` (human audit prose only), and **`stop_causes`** (structured policy input — required when `stop: true`). Derive `stop_causes` with [`scripts/lib/derive-stop-causes.ts`](node_modules/renovate-workflow/scripts/lib/derive-stop-causes.ts) — do not invent ad-hoc keys. The executor stops immediately without attempting merge. Only `auto_merge_eligible` and `agent_review_required` packets use `stop: false` at classification time.

### Stop causes (`stop_causes`)

Structured enum keys derived at classification time. Maintainer guardrails read **`stop_causes` only** — never parse `stop_reason` for policy input.

| `stop_causes` key                           | Derivation (`deriveStopCauses`)                                    |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `decision_human_required`                   | `classification.decision === human_required`                       |
| `stop_flag_expected_human_required`         | `stop === true` and decision is `human_required`                   |
| `triggered_implementation_changes_required` | `implementation_changes_required` ∈ `triggered_human_required`     |
| `triggered_lockfile_threshold_exceeded`     | `lockfile_threshold_exceeded` ∈ `triggered_human_required`         |
| `triggered_ci_failure_unexplained`          | `ci_failure_unexplained` ∈ `triggered_human_required`              |
| `triggered_runtime_behavior_affected`       | `runtime_behavior_affected` ∈ triggers and other triggers present  |
| `triggered_runtime_behavior_affected_sole`  | `triggered_human_required === [runtime_behavior_affected]` exactly |
| `triggered_human_required_unmapped`         | any `triggered_human_required` key outside the watch-list enum     |
| `decision_defer`                            | `classification.decision === defer` (never overridable)            |

**Fail-closed:** if `stop: true` and `stop_causes` is missing, empty, or contains an unknown key, maintainer guardrails treat all stops as non-overridable.

Example high-touch patch packet (vitest #402 shape):

```yaml
stop: true
stop_reason: runtime_behavior_affected
stop_causes:
  - decision_human_required
  - stop_flag_expected_human_required
  - triggered_runtime_behavior_affected_sole
```

### Watch-list keys

For `human_required_if` / `triggered_human_required` only — **not** `risk_class` values:

| Key                               | Meaning                                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `implementation_changes_required` | Sensitive paths touched, unexpected non-version files, breaking release notes, workflow edits beyond `uses:` pins or Action major bumps |
| `lockfile_threshold_exceeded`     | Rubric lockfile impact thresholds exceeded (`within_threshold: false`)                                                                  |
| `ci_failure_unexplained`          | CI red/pending/unknown without clear Renovate-only cause                                                                                |
| `runtime_behavior_affected`       | Runtime dep bump, high-touch package, analytics/auth paths                                                                              |

---

## `required_checks` assembly (classifier)

The classifier builds `required_checks` per packet. The executor verifies **only** checks listed on the packet (authoritative).

| Always on every packet                           | `pr_ci_green`, `post_merge_main_ci_green` |
| ------------------------------------------------ | ----------------------------------------- |
| `package-lock.json` in `changed_files`           | add `lockfile_within_threshold`           |
| any `.github/workflows/*.yml` in `changed_files` | add `workflow_uses_pin_only`              |
| `renovate.json` in `changed_files`               | add `validate_renovate_config`            |

Do **not** add `lockfile_within_threshold` when lockfile unchanged (e.g. workflow-only PR). Do **not** add `workflow_uses_pin_only` when no workflow files changed.

### Conditional check semantics

- **`lockfile_within_threshold`** — hard gate: `evidence.lockfile_delta.within_threshold` must be `true` per rubric **Lockfile impact**. If false → `risk_class: large_lockfile`, `triggered_human_required: [lockfile_threshold_exceeded]`.
- **`workflow_uses_pin_only`** — hard gate: every workflow diff hunk must be a `uses:` pin **within the same Action major**. Any non-`uses:` edit → `triggered_human_required: [implementation_changes_required]`, `merge_authority: denied`. Action major bump → `risk_class: github_action_major`, `decision: human_required`, `triggered_human_required: [implementation_changes_required]`.
- **`validate_renovate_config`** — config validation workflow green.
- **`pr_ci_green`** — merge-blocking check from consumer `checks.pr_ci_green` (`workflow`, `job`).
- **`post_merge_main_ci_green`** — main branch CI after merge (consumer `checks.post_merge_main_ci_green`).

---

## Lockfile gates

Derive from [policy-rubric.base.md — Lockfile impact](../../agents/policy-rubric.base.md#lockfile-impact) and consumer `checks.lockfile_within_threshold.thresholds`:

- Set `lockfile_maintenance: true` when Renovate PR title/body indicates lock file maintenance (e.g. "Lock file maintenance") **or** changed files are lockfiles only with no `package.json` version bumps.
- Set `line_delta_limit` to **2000** when `lockfile_maintenance: true`, else **800**.
- Set `within_threshold: false` and populate `threshold_flags` when **any**:
  - `line_delta_total` **>** `line_delta_limit` → `line_delta_over_limit` (also `maintenance_over_2000` when `lockfile_maintenance` and limit is 2000)
  - `pr_file_count` **> 30** and `package_count == 1` (single-package PR) → `files_over_30`
- Do **not** use `lockfile_paths_changed` for the `files_over_30` gate — use `pr_file_count` from `get_files`.
- When any threshold fires: `decision: human_required`, `risk_class: large_lockfile`, `merge_authority: denied`, `triggered_human_required: [lockfile_threshold_exceeded]`, `stop: true`. Never assign `lockfile_patch` when `within_threshold: false`.

---

## Workflow hard gate

When `.github/workflows/*.yml` is in `changed_files`:

1. Populate `evidence.workflow_changes.files`, `uses_pin_only`, and `same_major_only` from the PR diff.
2. Add `workflow_uses_pin_only` to `required_checks`.
3. Safe pin-only PRs within same Action major: `risk_class: github_action_pin_same_major`, `merge_authority: allowed` — **not** `low_risk_tooling_major` / `allowed_if_no_code_changes`.
4. Non-`uses:` edits or Action major bumps: set `risk_class: github_action_major`, `decision: human_required`, `triggered_human_required: [implementation_changes_required]`, `merge_authority: denied`.

For `allowed_if_no_code_changes` (`low_risk_tooling_major` only), changed files must be manifest/lockfile-only (`**/package.json`, `package-lock.json`); workflow files are never eligible.
