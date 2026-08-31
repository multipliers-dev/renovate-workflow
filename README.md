# renovate-workflow

Governed Renovate merge ladder for Cursor: classify dependency PRs, investigate high-risk changes, and merge only when repo-local policy and human gates allow.

Renovate opens many dependency PRs. This product turns that queue into a repeatable **classify → route → (investigate) → maintainer** path with explicit policy, instead of ad-hoc merges.

```
classify (/renovate-classifier)
    → route by packet
        → low risk → maintainer (auto path)
        → high-touch / unlisted → investigator → human audit → maintainer --approved
    → optional loop (/renovate-loop) for repeated cycles
```

**Ownership split**

| Layer | Where it lives |
| --- | --- |
| Skills, agents, runbook, portable rubric | This repo (Cursor plugin) |
| Executable scripts (freshness poll, guardrails) | This repo (npm/git devDependency) |
| Policy facts, Renovate bot config, CI workflow | Your repo |

---

## Install (Cursor plugin)

Cursor imports this GitHub repository as a **local marketplace**, then installs the listed plugin.

**Step 1 — import marketplace**

Customize → **Plugins** → **+ Add** → **From GitHub Repository** → `https://github.com/multipliers-dev/renovate-workflow`

Or in Agent chat:

```text
/add-plugin https://github.com/multipliers-dev/renovate-workflow
```

**Step 2 — install plugin**

Customize → **Plugins** → open the imported **renovate-workflow** marketplace → install the **renovate-workflow** plugin.

Full adoption guide: [docs/adopt.md](docs/adopt.md)

---

## Quick start (classifier only)

Minimum path to evaluate the ladder — **no `package.json` changes required**.

1. Import marketplace (step 1 above)
2. Install the **renovate-workflow** plugin (step 2 above)
3. Confirm `/renovate-classifier` appears under Customize → Plugins
4. Copy [.agents/renovate-policy.template.yml](.agents/renovate-policy.template.yml) to `.agents/renovate-policy.yml` in your repo and customize package lists, checks, and paths — see [docs/policy-setup.md](docs/policy-setup.md) and [examples/example-repo/](examples/example-repo/)
5. Ensure GitHub access (`gh` CLI or GitHub MCP)
6. Run `/renovate-classifier`

Success is `queue_empty` or a classification packet. The classifier **never merges**.

---

## Enable loop / babysit helpers

Required for `/renovate-loop`, `/renovate-loop --babysit`, and the freshness poll CLI. Not required to try the classifier.

Add a git devDependency and script in your consumer `package.json`:

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

See [examples/adopt-stub/package.json](examples/adopt-stub/package.json) and [docs/adopt.md](docs/adopt.md).

---

## What this does not do

- Fully autonomous merging — human gates remain for high-risk and investigation paths
- Scheduled or webhook-driven automation — manual invocation only
- Classifier or investigator merge authority — only maintainer may merge, and only with a valid packet
- Loop with `--approved` — investigation-approved merges require a separate maintainer step
- Replace the Renovate bot — you still configure `renovate.json` and a Renovate workflow in your repo
- Cursor public marketplace or org Team Marketplace catalog — install via GitHub import of this repo

---

## Documentation

Primary adopter path:

1. [docs/adopt.md](docs/adopt.md) — plugin install + npm helpers + consumer layout
2. [docs/policy-setup.md](docs/policy-setup.md) — consumer policy sync model
3. [docs/renovate-workflow.md](docs/renovate-workflow.md) — operator runbook

Also:

- [docs/versioning.md](docs/versioning.md) — version alignment and git dependency pinning
- [docs/distribution-discovery.md](docs/distribution-discovery.md) — architecture rationale (maintainer deep-dive)
- [CONTRIBUTING.md](CONTRIBUTING.md) — development and contribution guidelines
- [AGENTS.md](AGENTS.md) — agent command reference

---

## Development

```bash
npm install
npm test
npm run typecheck
```

---

## Layout

```
.cursor-plugin/        Marketplace + plugin manifests
.cursor/skills/        Five renovate skills + verification assets
.agents/               Agent prompts, rubric base, policy template, report templates
docs/                  Adoption guides and runbook
scripts/               Guardrails, freshness poll, tests/fixtures
examples/example-repo/ Synthetic consumer stubs for policy schema tests
```

---

## History

Originally extracted from [codenames-ai-guesser](https://github.com/multipliers-dev/codenames-ai-guesser) into a portable product. Extraction plan (archived): [.cursor/plans/archive/2026-08-31-extract-renovate-workflow.plan.md](.cursor/plans/archive/2026-08-31-extract-renovate-workflow.plan.md).

Licensed under [MIT](LICENSE).
