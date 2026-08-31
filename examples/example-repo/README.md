# Example consumer layout

Synthetic template for schema tests and adoption — **not** a snapshot of any production repository.

Copy pieces into your consumer repo:

| File here | Copy to consumer |
| --- | --- |
| `renovate-policy.yml` | `.agents/renovate-policy.yml` |
| `renovate.json` | `renovate.json` (customize) |
| `.github/workflows/renovate.yml` | `.github/workflows/renovate.yml` (customize) |

The policy file uses fictional `example-org/example-service` identifiers. Tests in this repo hardcode `examples/example-repo/renovate-policy.yml` — do not move it without updating test paths.

See [docs/adopt.md](../../docs/adopt.md) and [docs/policy-setup.md](../../docs/policy-setup.md).
