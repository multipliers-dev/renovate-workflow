# Policy rubric (portable base)

Interpret **consumer** `.agents/renovate-policy.yml`. This file stores **logic only** — not repository facts.

Pair with:

- Consumer `renovate.json` — Renovate bot grouping, schedule, branch prefix
- Consumer `.agents/renovate-policy.yml` — facts and check bindings
- Consumer `.github/workflows/renovate.yml` — how Renovate runs

Do **not** duplicate package lists here. Unlisted packages are **derived** at interpretation time.

## Sync model

```
renovate.json
     ↕ (optional validation script — PR2+)
renovate-policy.yml   ← single consumer config source for agent facts
     ↓
policy-rubric.base.md ← this file (portable interpretation)
```

## Classification ladder

Given `packages` in consumer policy:

| Match | Classification | Default risk class |
| --- | --- | --- |
| Name in `packages.high_touch` | `high_touch` | `review_manually` |
| Name in `packages.low_risk_tooling` | `low_risk_tooling` | `auto_merge_candidate` |
| Covered by `packages.runtime_rule` and under `repo.workspace_roots` | `runtime` | `review_manually` |
| No match | `unlisted_package` (derived) | `investigate` |

**Unlisted rule:** `package ∉ high_touch ∪ low_risk_tooling` and not explained by runtime scope → `unlisted_package`.

## Risk classes

| Risk class | Meaning | Maintainer may merge when |
| --- | --- | --- |
| `auto_merge_candidate` | Low-touch tooling; batch-friendly | Guardrails pass + classification in `merge.batch_allowed_for` |
| `review_manually` | High-touch or runtime; evidence required | Human or maintainer after review skill packet is complete |
| `investigate` | Unlisted or ambiguous | Investigator lane completes; re-classify or update policy |
| `stop` | Hard block | Never merge until cause removed |

## Evidence loop (review_manually)

For `review_manually` PRs, gather evidence before merge:

1. **Upstream** — release notes / migration guide; map breaking changes
2. **Usage** — how this repo uses the dependency
3. **Custom risk** — sensitive paths (`repo.sensitive_paths`) touched or implicated
4. **Validation** — checks bound in `checks.required` (CI workflow or command)

Zero source changes is a **conclusion** after the loop, not an assumption.

## Guardrail stop causes

Deterministic gates (see `scripts/lib/derive-stop-causes.ts`):

- `policy_version_drift` — packet stale vs active policy
- `stale_head_sha` — PR moved since classification
- `merge_authority_denied` — packet not authorized for agent merge
- `unknown_risk_class` — classifier emitted unrecognized class
- `unlisted_package` — policy has no bucket for package
- `required_check_missing` / `required_check_failed` — CI/command gates

## Deployment modes

Read `deployment.mode` from consumer policy:

| Mode | Typical setup |
| --- | --- |
| `pat_branch` | PAT credential; Renovate branches prefixed `renovate/` |
| `github_app` | GitHub App installation; workflow mints short-lived tokens |

Resolve `repo.owner` / `repo.name` from git remote when omitted.

## Checks binding

`checks.required` names are the canonical gate list. Each entry requires `workflow` (GitHub Actions workflow file name) **or** `command` (local verification command). Classifier packets must record each required check status.

## Merge authority

When `merge.authority` is `human`, maintainer agent produces recommendations only.

When `maintainer_agent`, merge proceeds only if:

- Guardrails pass
- Risk class allows merge for classification
- Freshness poll confirms current `head_sha`
