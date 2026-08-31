---
name: renovate-freshness
description: Detect stale classifier packets and blocked merge state before maintainer action.
---

# Renovate freshness

Poll local audit packets against current PR HEAD and active policy.

## CLI

```bash
npx tsx scripts/renovate-freshness-poll.ts \
  --policy /path/to/.agents/renovate-policy.yml \
  --runs /path/to/.agent-runs/renovate/ \
  --head-sha <current-head>
```

## When to use

- Before maintainer merge
- Scheduled hygiene check on open Renovate PRs
- After force-push or rebase on Renovate branch

## Output

- `freshness: current` — guardrails pass for supplied HEAD
- `freshness: stale_or_blocked` — stop causes listed

## Cross-links

- Implementation: [scripts/renovate-freshness-poll.ts](../../scripts/renovate-freshness-poll.ts)
- Guardrails: [scripts/lib/renovate-guardrails.ts](../../scripts/lib/renovate-guardrails.ts)

## Verification

See [verification.md](verification.md).
