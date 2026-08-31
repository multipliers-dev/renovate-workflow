# Example consumer layout

Synthetic template for schema tests and adoption — **not** a snapshot of any production repository.

Copy pieces into your consumer repo:

| File here | Copy to consumer |
| --- | --- |
| `renovate-policy.yml` | `.agents/renovate-policy.yml` |
| `renovate.json` | `renovate.json` (customize) |
| `.github/workflows/renovate.yml` | `.github/workflows/renovate.yml` (customize) |

**Policy vs grouping:** `renovate-policy.yml` holds risk classes and ladder facts. `renovate.json` holds bot mechanics only. This stub groups GitHub Actions (`pinDigests: true`) because workflow pins digest together; npm packages stay on individual PRs unless your repo has a genuine dependency stack. Do not mirror policy bucket names in Renovate `groupName` rules.

The policy file uses fictional `example-org/example-service` identifiers. Tests in this repo hardcode `examples/example-repo/renovate-policy.yml` — do not move it without updating test paths.

See [docs/adopt.md](../../docs/adopt.md) and [docs/policy-setup.md](../../docs/policy-setup.md).
