# Renovate review policy (classifier entrypoint)

Apply within the **renovate-classifier** skill only.

**Do not classify from embedded package lists in this file.** Consumer facts live in `.agents/renovate-policy.yml`:

| Consumer YAML | Classifier use |
| --- | --- |
| `packages.high_touch` | High-touch package lookup → `high_touch_tooling` |
| `packages.low_risk_tooling` | Low-risk tooling lookup (supports `*` globs) → patch/major carve-outs |
| `packages` absence + `dependencies` | Runtime scope → `runtime_dependency` |
| Package unmatched above | Derived → `unlisted_package` |
| `repo.sensitive_paths`, `repo.analytics_paths`, `repo.auth_paths`, `repo.sensitive_path_rules` | Path blast radius → matching `risk_class` |
| `checks.pr_ci_green` | Merge-blocking CI workflow/job |
| `checks.lockfile_within_threshold.thresholds` | Lockfile line delta and file-count gates |
| `check_assembly` + `checks.*` | `required_checks` assembly |
| `version` | Packet `policy_version` |

## Required workflow

1. **Load** consumer `.agents/renovate-policy.yml` at the start of every classify run (before package or path classification).
2. **Apply** portable interpretation in [policy-rubric.base.md](../../../.agents/policy-rubric.base.md) using loaded facts.
3. **Derive** packets per [packet-schema.md](packet-schema.md).

Programmatic helpers (tests + maintainer): [`scripts/lib/renovate-policy-facts.ts`](../../../scripts/lib/renovate-policy-facts.ts).

Synthetic example policy for contract tests: [examples/example-repo/renovate-policy.yml](../../../examples/example-repo/renovate-policy.yml).

Template for new consumers: [renovate-policy.template.yml](../../../.agents/renovate-policy.template.yml).

Sync model: [docs/policy-setup.md](../../../docs/policy-setup.md).
