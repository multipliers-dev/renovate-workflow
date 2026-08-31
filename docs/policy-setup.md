# Policy setup

How consumer `renovate-policy.yml` relates to portable rubric logic and Renovate bot config.

## Sync model

Consumer facts live in **one YAML file**; portable rubric **interprets** them.

```
renovate.json              ← Renovate bot (groups, schedule, branch prefix)
       ↕
       optional validation script (future)
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
2. Fill package lists and checks for that repo
3. Omit `repo.owner` / `repo.name` to resolve from git remote
4. Add `.agent-runs/renovate/` to consumer `.gitignore`
5. Install skills/agents via the Cursor plugin (see [adopt.md](adopt.md)); do not vendor them

## Synthetic reference

[examples/example-repo/renovate-policy.yml](../examples/example-repo/renovate-policy.yml) demonstrates schema only — synthetic `example-org/example-service`, not a production snapshot.

## renovate.json relationship

`renovate.json` controls Renovate bot mechanics (scheduling, branch prefix, optional **topology** grouping). Agent ladder reads **policy YAML** for classification and check bindings.

**Grouping ≠ risk classification.** Policy buckets (`packages.high_touch`, `packages.low_risk_tooling`) answer how the ladder should review an update. Renovate `groupName` rules answer which updates should land in one PR because they form a dependency stack (for example GitHub Actions pins that digest together). Do not mirror policy risk classes in `renovate.json`, and do not add catch-all npm minor/patch groups — unrelated packages belong in separate PRs unless they genuinely share topology.

Example stubs keep GitHub Actions grouped with `pinDigests: true` only; npm packages default to individual PRs. Add further groups only for real stacks (eslint plugin families, framework cores), not for review policy.

## Verification

- `npm test` — guardrail fixtures + `renovate-policy-facts` (consumer YAML drives classification)
- Skill verification checklists under `.cursor/skills/renovate-*/verification.md`
