# Policy rubric (portable base)

Interpret **consumer** `.agents/renovate-policy.yml`. This file stores **portable logic only** — no repository-specific package lists, sensitive paths, or CI bindings.

Classifier entrypoint: [policy-rubric.md](../.cursor/skills/renovate-classifier/policy-rubric.md) (requires loading consumer YAML first).

## Sync model

```
renovate.json
     ↕ (optional validation — PR2+)
renovate-policy.yml   ← consumer facts (packages, paths, checks)
     ↓
policy-rubric.base.md ← this file (portable interpretation)
```

**Unlisted rule:** `package ∉ packages.high_touch ∪ packages.low_risk_tooling` and not a runtime `dependencies` entry under `repo.workspace_roots` → `unlisted_package`.

Use [`scripts/lib/renovate-policy-facts.ts`](../scripts/lib/renovate-policy-facts.ts) for deterministic package/path/threshold lookup in tests and tooling.

## Per-PR deliverables

For each PR:

1. Summarize what changed.
2. Identify risk level: low / medium / high.
3. Check CI status (per `checks.pr_ci_green`).
4. Inspect lockfile impact (per `checks.lockfile_within_threshold.thresholds`).
5. Note release-note concerns if available.
6. Recommend: merge / review manually / defer.

**Do not merge anything.**

## Recommendation mapping

| Classification | Recommendation | Packet `decision` |
| --- | --- | --- |
| Safe to merge (all gates) | merge | `auto_merge_eligible` |
| Low-risk tooling major (gates pass) | review manually | `agent_review_required` |
| Needs human review | review manually | `human_required` |
| Defer | defer | `defer` |

**Precedence:** defer → `defer`; else human-review triggers (major semver except low-risk tooling devDep carve-out) → `review manually`; else low-risk tooling major carve-out → `agent_review_required`; else all safe-merge gates → `merge`; else → `review manually`.

## Renovate identity

Read `repo.renovate_branch_prefix` and `deployment.mode` from consumer policy:

| Mode | Renovate-authored when |
| --- | --- |
| `pat_branch` | `head.ref` starts with `renovate/` (PAT owner author expected) |
| `github_app` | Author is `app/renovate` (head branch may differ) |

Do not fail identity solely because `user.login` is not `app/renovate` when discovered via head-branch prefix.

## Package classification (from consumer YAML)

For each bumped package, look up once against loaded policy:

1. Match `packages.high_touch` → high-touch (any bump → human review; `risk_class: high_touch_tooling`)
2. Else match `packages.low_risk_tooling` (glob patterns supported) → low-risk tooling path
3. Else if `dependencies` (not devDependency) under `repo.workspace_roots` → runtime (`runtime_dependency`)
4. Else → unlisted (`unlisted_package`, investigation-eligible when stop_causes overridable)

GitHub Actions **major** pin bumps are always high-touch (`github_action_major`), regardless of npm lists.

## Grouped dependency PRs

Grouped PRs are not automatically `review manually`. Evaluate against safe-merge gates plus:

**Grouped → merge** when every package is patch/minor low-risk tooling devDependency, CI green, files limited to manifests/lockfile/workflow pins, lockfile within thresholds, no breaking notes.

**Grouped → review manually** when any runtime/framework dep, high-touch package, unlisted package, non-qualifying major, large lockfile, CI not green, or breaking notes.

**Grouped → agent review** when every major is low-risk tooling devDependency and low-risk tooling major carve-out gates pass.

Renovate group labels from consumer `renovate.json` are hints only — classify by package contents and bump type.

## Low-risk tooling major → agent review

When **all** true:

- At least one major semver bump
- Every bumped package ∈ `packages.low_risk_tooling` (not high-touch, not unlisted)
- All bumped packages are devDependencies
- Changed files limited to `**/package.json` and `package-lock.json` (no workflow files)
- CI green, lockfile within policy thresholds, no sensitive paths, no breaking notes

→ Packet `agent_review_required`, `merge_authority: allowed_if_no_code_changes`, `risk_class: low_risk_tooling_major`.

## Safe to merge

All must be true:

- Renovate-authored
- CI green (`checks.pr_ci_green` job success)
- Files limited to manifests, lockfile, workflow version-pin lines
- No edits under consumer sensitive/analytics/auth paths
- No breaking-change signals
- Lockfile within thresholds from policy
- For grouped PRs: all grouped → merge gates above

## Needs human review

Any of:

- Major semver (except low-risk tooling devDep carve-out)
- GitHub Actions major bump
- High-touch package (from `packages.high_touch`)
- Unlisted package (derived)
- Runtime dependency (from runtime scope rule)
- CI failure, pending, cancelled, or unknown checks
- Lockfile exceeds policy thresholds
- Unexpected non-version files
- Sensitive/analytics/auth path touched (from `repo.*` path rules)

## Defer

- Draft PR or failing CI with no quick fix
- Breaking changes in release notes
- Unexpected source/prompt/workflow-logic changes
- Conflicting Renovate PRs
- Major runtime stack needing coordinated land

## GitHub Actions

Workflow pin changes in `.github/workflows/*.yml` only:

- Same major patch/minor → `github_action_pin_same_major` when gates pass
- Major bump → `github_action_major`, never auto-merge

## Sensitive paths (from consumer YAML)

Use `resolveSensitivePathRiskClass` or equivalent lookup against:

- `repo.sensitive_path_rules[]` (pattern + `risk_class`)
- `repo.analytics_paths` → `analytics_or_telemetry`
- `repo.auth_paths` → `auth_or_security`
- `repo.sensitive_paths` → `sensitive_path_change`

`renovate.json` changes → `renovate_config_change`.

Allowed without sensitive-path trigger: manifest, lockfile, single-line `uses:` pin edits only.

## Lockfile impact

Thresholds from `checks.lockfile_within_threshold.thresholds`:

- `line_delta_limit_default` (typically 800)
- `line_delta_limit_lockfile_maintenance` (typically 2000)
- `pr_file_count_single_package_max` (typically 30)

Derive `lockfile_maintenance` from Renovate title/body or lockfile-only diffs. Flag `within_threshold: false` → `large_lockfile`.

## CI interpretation

Merge-blocking check from `checks.pr_ci_green` (`workflow`, `job`). Treat check failures on that job as blocking. Renovate-only workflows are not merge gates unless their checks appear on the PR.

## Rubric outcome → packet fields

| Rubric outcome | `decision` | `merge_authority` | `risk_class` |
| --- | --- | --- | --- |
| Lockfile-only within thresholds | `auto_merge_eligible` | `allowed` | `lockfile_patch` |
| Low-risk devDep patch/minor | `auto_merge_eligible` | `allowed` | `low_risk_tooling_patch` |
| GitHub Actions pin same major | `auto_merge_eligible` | `allowed` | `github_action_pin_same_major` |
| Low-risk tooling major carve-out | `agent_review_required` | `allowed_if_no_code_changes` | `low_risk_tooling_major` |
| High-touch package | `human_required` | `denied` | `high_touch_tooling` |
| GitHub Actions major | `human_required` | `denied` | `github_action_major` |
| Runtime dependency | `human_required` | `denied` | `runtime_dependency` |
| Unlisted package | `human_required` | `denied` | `unlisted_package` |
| Lockfile exceeds thresholds | `human_required` | `denied` | `large_lockfile` |
| Analytics paths | `human_required` | `denied` | `analytics_or_telemetry` |
| Auth paths | `human_required` | `denied` | `auth_or_security` |
| Other sensitive paths | `human_required` | `denied` | `sensitive_path_change` |
| `renovate.json` changed | `human_required` | `denied` | `renovate_config_change` |
| Defer triggers | `defer` | `denied` | (highest applicable) |

`risk_class` enum must match consumer policy `risk_classes` and [packet-schema.md](../.cursor/skills/renovate-classifier/packet-schema.md).

## Stop causes and required checks

- Derive `stop_causes` with [`derive-stop-causes.ts`](../scripts/lib/derive-stop-causes.ts)
- Assemble `required_checks` per [packet-schema.md](../.cursor/skills/renovate-classifier/packet-schema.md) from `check_assembly` + `checks.*`
- Set `policy_version` from consumer policy `version`

## Investigation lane

When `risk_class` is `high_touch_tooling` or `unlisted_package`, packet is `stop: true`, and only overridable `stop_causes` remain per `execution_modes.investigation_approved`, route to renovate-investigator.

Synthetic reference: [examples/example-repo/renovate-policy.yml](../examples/example-repo/renovate-policy.yml).
