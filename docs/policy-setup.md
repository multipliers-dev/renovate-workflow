# Policy setup

How consumer `renovate-policy.yml` relates to portable rubric logic and Renovate bot config.

## Chosen sync model (PR1)

Avoid triple-sync. Consumer facts live in **one YAML file**; portable rubric **interprets** them.

```
renovate.json              ← Renovate bot (groups, schedule, branch prefix)
       ↕
       optional validation script (deferred to PR2+)
       ↕
renovate-policy.yml        ← consumer facts + check bindings (single source)
       ↓
policy-rubric.base.md      ← portable interpretation (this repo, no repo facts)
```

### What goes in consumer YAML

Store **facts needed to derive classifications**, not duplicated derived labels:

| Section | Purpose |
| --- | --- |
| `policy_version` | Bump when facts change; packets record version |
| `repo.workspace_roots` | Manifest roots for runtime scope |
| `repo.sensitive_paths` / `repo.analytics_paths` / `repo.auth_paths` | Path blast-radius rules |
| `packages.high_touch` | Explicit allowlist |
| `packages.low_risk_tooling` | Explicit allowlist (supports `*` globs) |
| `checks.pr_ci_green` / `checks.lockfile_within_threshold` | CI and lockfile gate bindings |
| `check_assembly` + `checks.*` | Required-check assembly for packets |
| `deployment.mode` | PAT branch vs GitHub App |

### Derived fields (do not store)

- **`unlisted_package`** — package not in any configured bucket
- **Risk class** — computed from classification via [policy-rubric.base.md](../.agents/policy-rubric.base.md)

### What does NOT get a third file

Do not embed package lists or CI bindings in `.cursor/skills/renovate-classifier/policy-rubric.md` — that file is a thin entrypoint only. Classifier loads consumer YAML, then applies [policy-rubric.base.md](../.agents/policy-rubric.base.md). Deterministic lookup: [`scripts/lib/renovate-policy-facts.ts`](../scripts/lib/renovate-policy-facts.ts).

## Bootstrap a consumer

1. Copy [.agents/renovate-policy.template.yml](../.agents/renovate-policy.template.yml) → consumer `.agents/renovate-policy.yml`
2. Fill package allowlists and checks for that repo
3. Omit `repo.owner` / `repo.name` to resolve from git remote
4. Add `.agent-runs/renovate/` to consumer `.gitignore`
5. Install portable skills/agents via PR2 distribution adapter (not vendored in PR1)

## Synthetic reference

[examples/example-repo/renovate-policy.yml](../examples/example-repo/renovate-policy.yml) demonstrates schema only. **Codenames parity validation is PR3**, not this repository.

## renovate.json relationship

`renovate.json` controls bot mechanics (grouping, scheduling). Agent ladder reads **policy YAML** for classification and check bindings. Optional cross-validation between JSON groups and YAML allowlists is deferred to PR2+.

## Verification

- `npm test` — guardrail fixtures + `renovate-policy-facts` (consumer YAML drives classification)
- Skill verification checklists under `.cursor/skills/renovate-*/verification.md`
