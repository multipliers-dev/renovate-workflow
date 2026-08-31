# Adopting the Renovate ladder in a consumer repo

Install the **Cursor plugin** from this repository for skills, agent docs, templates, and runbook. Add a small **npm/git devDependency** on the same repo for executable scripts. Keep **repo-specific facts** local — no vendoring the full tree and no dependency on codenames-ai-guesser.

Phase A evidence: [distribution-discovery.md](distribution-discovery.md).

---

## What you install where

| Layer | Source | Consumer action |
| --- | --- | --- |
| Skills, runbook, portable rubric, agent prompts, report templates | **This repo as a Cursor plugin** | Customize → Plugins → Add → From GitHub → `https://github.com/multipliers-dev/renovate-workflow` |
| Executable TypeScript (`scripts/lib/*`, freshness poll CLI) | **Same repo via npm/git** | `devDependencies` (see below) |
| Policy facts, Renovate bot config, CI workflow | **Your repo** | One-time copy + customize |

This repository is both the **canonical implementation** and the **installable Cursor plugin** (`.cursor-plugin/plugin.json`). A separate marketplace catalog repo is optional organizational packaging only — not required for adoption.

---

## One-time setup

### 1. Install the Cursor plugin

**From GitHub (recommended):**

Customize → **Plugins** → **+ Add** → **From GitHub Repository** → `https://github.com/multipliers-dev/renovate-workflow`

Or in Agent chat / CLI:

```text
/add-plugin multipliers-dev/renovate-workflow
```

**Local testing** (before publish): clone into Cursor's local plugin directory per [Cursor plugin docs](https://cursor.com/docs/plugins#test-plugins-locally):

```bash
git clone https://github.com/multipliers-dev/renovate-workflow.git ~/.cursor/plugins/local/renovate-workflow
```

Restart Cursor or run **Developer: Reload Window**. Confirm `/renovate-classifier` appears under Customize → Plugins.

Plugin components resolve from this repo's tree:

| Component | Path in repo |
| --- | --- |
| Manifest | `.cursor-plugin/plugin.json` |
| Skills | `.cursor/skills/renovate-*` |
| Agent prompts + templates | `.agents/` |
| Runbook | `docs/renovate-workflow.md` |

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

For `/renovate-loop --babysit`, the classifier shells out to the freshness poll CLI:

```bash
npm run renovate:freshness-poll -- --repo owner/repo --pr 123 --expected-head abc123
```

See [examples/adopt-stub/package.json](../examples/adopt-stub/package.json).

### 3. Consumer policy (required)

```bash
mkdir -p .agents
cp node_modules/renovate-workflow/.agents/renovate-policy.template.yml .agents/renovate-policy.yml
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
3. **Execute** — `/renovate-maintainer` or `/renovate-investigator` (prefer skill invoke over `@.agents/` file refs in consumer workspace)
4. **Loop** — `/renovate-loop` for repeated classify → execute cycles

Full walkthrough: [renovate-workflow.md](renovate-workflow.md) (also in the installed plugin's `docs/`).

---

## What you do **not** copy

Do **not** vendor into the consumer repo:

- `.cursor/skills/renovate-*`
- `.agents/renovate-maintainer.md`, `renovate-investigator.md`, `policy-rubric.base.md`
- `docs/renovate-workflow.md`
- `scripts/lib/*`, fixtures, or tests

Those ship via plugin install + npm git dependency on this same repository. Codenames PR3 deletes its duplicate copies and adopts this layout.

---

## Verification checklist

- [ ] Plugin installed from `multipliers-dev/renovate-workflow`; `/renovate-classifier` appears in Agent chat
- [ ] `.agents/renovate-policy.yml` exists and `version` is set
- [ ] `npm run renovate:freshness-poll --` prints usage (after `npm install`)
- [ ] `.agent-runs/renovate/` is gitignored
- [ ] Classifier loads policy from consumer workspace (not hardcoded owner/repo)
