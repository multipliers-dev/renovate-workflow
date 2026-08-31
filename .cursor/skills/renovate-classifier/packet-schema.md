# Classifier packet schema

Version: `schema_version: 1`

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | number | Packet format version |
| `policy_version` | number | Copy of active `renovate-policy.yml` version |
| `pr_number` | number | GitHub PR number |
| `head_sha` | string | PR HEAD commit (40 hex) |
| `base_sha` | string | PR base commit |
| `package_name` | string | Primary updated package |
| `classification` | string | `high_touch`, `low_risk_tooling`, `runtime`, `unlisted_package` |
| `risk_class` | string | `auto_merge_candidate`, `review_manually`, `investigate`, `stop` |
| `merge_authority` | string | `maintainer_agent` or `human` |
| `captured_at` | string | ISO-8601 timestamp |
| `checks` | array | `{ name, status }` for each required check |

## Check status values

- `success` — green / passed
- `failure` — red / failed
- `pending` — in progress
- `missing` — not found

## Validation

Use `scripts/lib/renovate-packet.ts` (`validateClassifierPacket`).

Fixtures: [scripts/fixtures/packet-valid.json](../../scripts/fixtures/packet-valid.json)
