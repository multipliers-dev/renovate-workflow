# Adopting the Renovate ladder in a consumer repo

Install the **Cursor plugin** for skills, agent docs, templates, and runbook. Keep **repo-specific facts** and **executable scripts** local via a small npm devDependency — no vendoring of the full renovate-workflow tree and no dependency on codenames-ai-guesser.

Phase A evidence: [distribution-discovery.md](distribution-discovery.md).

---

## What you install where

| Layer | Source | Consumer action |
| --- | --- | --- |
| Skills, runbook, portable rubric, agent prompts, report templates | **cursor-team-marketplace** plugin `renovate-workflow` | Customize → Plugins → Add → From GitHub → `https://github.com/multipliers-dev/cursor-team-marketplace` (after marketplace PR merges) |
| Executable TypeScript (`scripts/lib/*`, freshness poll CLI) | **renovate-workflow** npm/git package | `devDependencies` (see below) |
| Policy facts, Renovate bot config, CI workflow | **Your repo** | One-time copy + customize |

---

## One-time setup

### 1. Install the Cursor plugin

When [cursor-team-marketplace](https://github.com/multipliers-dev/cursor-team-marketplace) lists `renovate-workflow`:

Customize → **Plugins** → **+ Add** → **From GitHub Repository** → `https://github.com/multipliers-dev/cursor-team-marketplace`.

Until that PR lands, install skills from a git checkout of this repo or wait for the marketplace registration PR.

### 2. Add npm runtime (scripts only)

In the consumer repo `package.json`:

```json
{
  "devDependencies": {
    "renovate-workflow": "github:multipliers-dev/renovate-workflow",
    "tsx": "^4.23.12"
  },
  "scripts": {
    "renovate:freshness-poll": "tsx node_modules/renovate-workflow/scripts/renovate-freshness-poll.ts"
  }
}
```

Then `npm install`.

Skills reference scripts under `node_modules/renovate-workflow/scripts/` (plugin copy uses these paths). For babysit:

```bash
npm run renovate:freshness-poll -- --repo owner/repo --pr 123 --expected-head abc123
```

### 3. Consumer policy (required)

```bash
mkdir -p .agents
cp path/to/plugin/agents/renovate-policy.template.yml .agents/renovate-policy.yml
# Edit package lists, checks.*, repo.* for this repository
```

See [policy-setup.md](policy-setup.md). Example facts: [examples/example-repo/renovate-policy.yml](../examples/example-repo/renovate-policy.yml).

### 4. Renovate bot config

Add `renovate.json` and `.github/workflows/renovate.yml` for your deployment mode (`pat_branch` vs `github_app`). Set `repo.renovate_branch_prefix` in policy YAML to match.

### 5. Gitignore audit trail

```gitignore
.agent-runs/renovate/
```

Reports are written per run; never commit them.

---

## Operating the ladder

1. **Classify** — `/renovate-classifier` or `/renovate-classifier 412`
2. **Route** by packet: maintainer auto path, investigation lane, or hard stop
3. **Execute** — `/renovate-maintainer` or `/renovate-investigator` (prefer skills over `@.agents/` file refs)
4. **Loop** — `/renovate-loop` for repeated classify → execute cycles

Full walkthrough: plugin `docs/renovate-workflow.md` (same content as [renovate-workflow.md](renovate-workflow.md) here).

---

## What you do **not** copy

Do **not** vendor into the consumer repo:

- `.cursor/skills/renovate-*`
- `.agents/renovate-maintainer.md`, `renovate-investigator.md`, `policy-rubric.base.md`
- `docs/renovate-workflow.md`
- `scripts/lib/*`, fixtures, or tests

Those ship via plugin + git npm package. Codenames PR3 deletes its copies and adopts this layout.

---

## Marketplace maintainer: sync plugin from canonical repo

Regenerate the marketplace plugin tree from **this** repository (source of truth):

```bash
./scripts/sync-cursor-plugin.sh
# Copy distribution/cursor-plugin/ → cursor-team-marketplace/plugins/renovate-workflow/
# Register in .cursor-plugin/marketplace.json:
#   { "name": "renovate-workflow", "source": "renovate-workflow", "description": "..." }
```

See [distribution-discovery.md](distribution-discovery.md) for path rewrite rules.

---

## Verification checklist

- [ ] Plugin installed; `/renovate-classifier` appears in Agent chat
- [ ] `.agents/renovate-policy.yml` exists and `version` is set
- [ ] `npm run renovate:freshness-poll -- --help` prints usage
- [ ] `.agent-runs/renovate/` is gitignored
- [ ] Classifier loads policy from workspace (not hardcoded owner/repo)
