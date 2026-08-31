# Policy rubric (portable base)

Interpret **consumer** `.agents/renovate-policy.yml`. This file stores **portable logic** — not repository-specific package lists or CI bindings.

Pair with:

- Consumer `renovate.json` — Renovate bot grouping, schedule, branch prefix
- Consumer `.agents/renovate-policy.yml` — facts (packages, checks, repo paths, deployment mode)
- Consumer `.github/workflows/renovate.yml` — how Renovate runs
- Classifier skill [policy-rubric.md](../.cursor/skills/renovate-classifier/policy-rubric.md) — full classification workflow (references consumer facts)

## Sync model

```
renovate.json
     ↕ (optional validation — PR2+)
renovate-policy.yml   ← consumer facts + check bindings
     ↓
policy-rubric.base.md ← this file (portable interpretation)
```

**Unlisted rule:** `package ∉ packages.high_touch ∪ packages.low_risk_tooling` and not covered by runtime scope → `unlisted_package` (`human_required`, investigation-eligible when stop_causes are overridable only).

## Recommendation mapping

| Classification | Recommendation | Packet `decision` |
| --- | --- | --- |
| Safe to merge (all gates) | merge | `auto_merge_eligible` |
| Low-risk tooling major (gates pass) | review manually | `agent_review_required` |
| Needs human review | review manually | `human_required` |
| Defer | defer | `defer` |

## Rubric outcome → packet fields

| Rubric outcome | `decision` | `merge_authority` | `risk_class` |
| --- | --- | --- | --- |
| Lockfile-only within thresholds | `auto_merge_eligible` | `allowed` | `lockfile_patch` |
| Low-risk devDep patch/minor | `auto_merge_eligible` | `allowed` | `low_risk_tooling_patch` |
| GitHub Actions pin same major | `auto_merge_eligible` | `allowed` | `github_action_pin_same_major` |
| Low-risk tooling major carve-out | `agent_review_required` | `allowed_if_no_code_changes` | `low_risk_tooling_major` |
| High-touch package | `human_required` | `denied` | `high_touch_tooling` |
| GitHub Actions major | `human_required` | `denied` | `github_action_major` |
| Runtime/framework dependency | `human_required` | `denied` | `runtime_dependency` |
| Unlisted package | `human_required` | `denied` | `unlisted_package` |
| Lockfile exceeds thresholds | `human_required` | `denied` | `large_lockfile` |
| Sensitive / analytics / auth paths | `human_required` | `denied` | matching `risk_class` |
| `renovate.json` changed | `human_required` | `denied` | `renovate_config_change` |
| Defer triggers | `defer` | `denied` | (inherit highest applicable) |

`risk_class` enum must match consumer policy `risk_classes` buckets and [packet-schema.md](../.cursor/skills/renovate-classifier/packet-schema.md).

## Lockfile impact

- `line_delta_limit`: **2000** when `lockfile_maintenance: true`, else **800** (from consumer `checks.lockfile_within_threshold.thresholds`)
- Flag `within_threshold: false` when combined line delta exceeds limit or single-package `pr_file_count > 30`
- Never assign `lockfile_patch` when `within_threshold: false`

## Stop causes

Derive `stop_causes` with [`scripts/lib/derive-stop-causes.ts`](../scripts/lib/derive-stop-causes.ts). Set `stop: true` when `decision` is `human_required` or `defer`, or when `triggered_human_required` is non-empty.

## Investigation lane

When `risk_class` is `high_touch_tooling` or `unlisted_package`, packet is `stop: true`, and only overridable `stop_causes` remain per consumer `execution_modes.investigation_approved`, route to renovate-investigator. Investigation-approved merge remains restricted to `allowed_paths` in policy.

## Deployment modes

| Mode | Renovate identity |
| --- | --- |
| `pat_branch` | Head branch `renovate/*`; PAT owner author (not `app/renovate`) |
| `github_app` | Author typically `app/renovate` |

Resolve `repo.owner` / `repo.name` from git remote when omitted in consumer policy.

## Required checks assembly

Always include `pr_ci_green` and `post_merge_main_ci_green`. Add conditional checks from consumer `check_assembly.conditional` when applicable changed files are present. Bindings live in consumer `checks.*`.

## Guardrails (executor)

Deterministic gates in [`scripts/lib/renovate-guardrails.ts`](../scripts/lib/renovate-guardrails.ts):

- `policy_version` drift
- `head_sha` stale
- `merge_authority` / `allowed_paths`
- `unknown_risk_class`
- `triggered` / structured `stop_causes`

Synthetic reference policy for tests: [examples/example-repo/renovate-policy.yml](../examples/example-repo/renovate-policy.yml).
