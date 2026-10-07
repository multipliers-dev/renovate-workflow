# Distribution discovery — architecture rationale

> **Maintainer deep-dive.** New adopters should follow [README](../README.md) → [adopt.md](adopt.md) → [policy-setup.md](policy-setup.md) → [renovate-workflow.md](renovate-workflow.md). This document explains *why* the install boundary looks the way it does.

Evidence for the minimum local boundary when adopting the Renovate ladder via **Cursor plugin install** from [renovate-workflow](https://github.com/multipliers-dev/renovate-workflow) — without vendoring the full tree or routing through a separate marketplace mirror repo.

## npm + plugin dual channel (rollout)

| Channel | Artifact | Version coupling |
| --- | --- | --- |
| **Cursor plugin** | `skills/`, `.agents/`, docs — git marketplace import | Tag / commit at version *V* |
| **npm package** | `@multipliers-dev/renovate-workflow` — compiled CLI in `dist/` | Registry version *V* |

**`@multipliers-dev` npm org:** created and controlled by the project owner. Target package name **`@multipliers-dev/renovate-workflow`** is confirmed.

**Unified version policy:** version *V* always means the same repository commit for both channels. Releases are intentional and two-step — version bump in a reviewed PR, then manual [`release.yml`](../.github/workflows/release.yml) dispatch (`npm publish --access public` + `vX.Y.Z` tag + GitHub Release). Merging to `main` never publishes. See [versioning.md](versioning.md).

**Rollout state (2026-10):** `version-bump-0.3.0` merged on `main`; release workflow uses npm **Trusted Publishing** (OIDC). First npm publish awaits one-time registry bootstrap + Trusted Publisher configuration (see [versioning.md § Trusted Publishing](versioning.md#trusted-publishing-oidc)). Git consumers (Codenames, Portfolio) still use the legacy `tsx` + `scripts/` path until migrated.

**Precedent:** [Cursor multi-plugin repositories](https://cursor.com/docs/reference/plugins#cursor-multi-plugin-repositories) — a repo can ship `.cursor-plugin/marketplace.json` plus per-plugin `.cursor-plugin/plugin.json`. GitHub import (`/add-plugin <url>` or Customize → Plugins → Add → From GitHub) imports the **marketplace**, then the user installs listed plugins. This repo uses that pattern as a **single-plugin marketplace wrapper** (`"source": "."` → root `.cursor-plugin/plugin.json`). That is a **local/non-team** marketplace import, not Cursor's public marketplace and not an org Team Marketplace catalog.

---

## Plugin resolution (this repo is the plugin)

| Asset | Plugin-only? | Evidence |
| --- | --- | --- |
| **Skills** (5 × `renovate-*`) | **Yes** | Fixed `skills/` (Agent Plugins 1.0) + Cursor manifest `"skills": "./skills"`; invoke via `/renovate-classifier`, etc. GitHub marketplace install clones skills with the plugin ([Cursor component discovery](https://cursor.com/docs/reference/plugins)). |
| **Runbook** (`docs/renovate-workflow.md`) | **Yes** | Shipped in the same repo clone; skill/agent cross-links use relative paths. |
| **Portable rubric** (`policy-rubric.base.md`) | **Yes (via plugin)** | Lives in `.agents/`; classifier skills link `../../.agents/policy-rubric.base.md`. |
| **Policy template** (`renovate-policy.template.yml`) | **Yes (via plugin)** | Bootstrap only; consumer copies to `.agents/renovate-policy.yml`. |
| **Agent prompts** (`renovate-maintainer.md`, `renovate-investigator.md`) | **Plugin + skill invoke** | Manifest `"agents": ".agents"`. `@.agents/` in copy/paste blocks resolves from the **consumer workspace**, not plugin cache. **Mitigation:** invoke `/renovate-maintainer` and `/renovate-investigator`. |
| **Report templates** (`.agents/templates/*.md`) | **Yes (via plugin)** | Reports written under consumer `.agent-runs/renovate/`; template content read from plugin `.agents/templates/` via skill links. |
| **Executable CLI** (`renovate-workflow freshness-poll`) | **No — npm package (or interim git dep)** | Skills shell out via consumer `npm run renovate:freshness-poll`. Target: `@multipliers-dev/renovate-workflow` compiled `bin`. Interim git consumers still use `tsx` on packaged `scripts/`. No script vendoring into consumer repos. |

---

## Consumer-workspace access to `.agents/renovate-policy.yml`

Classifier, maintainer, loop, and investigator skills **must read** consumer `.agents/renovate-policy.yml` from the **active workspace** (see `skills/renovate-classifier/SKILL.md` §1).

Repo-specific facts (package lists, CI bindings, `repo.renovate_branch_prefix`) **cannot** live only in plugin cache.

**Bootstrap:** copy `.agents/renovate-policy.template.yml` from the installed plugin (or `node_modules/renovate-workflow/.agents/`) → consumer `.agents/renovate-policy.yml`. Example: [`examples/example-repo/renovate-policy.yml`](../examples/example-repo/renovate-policy.yml).

Portable interpretation stays in plugin `.agents/policy-rubric.base.md`.

---

## Freshness-poll and guardrail invocation paths

| Primitive | Path in this repo | Consumer invocation |
| --- | --- | --- |
| Freshness poll CLI | `dist/cli.js` (npm) / `scripts/renovate-freshness-poll.ts` (legacy git) | `npm run renovate:freshness-poll -- --repo … --pr … --expected-head …` |
| Babysit core | `scripts/lib/renovate-freshness-poll.ts` | Imported by CLI |
| Guardrails | `scripts/lib/renovate-guardrails.ts` | Agent follows skill prose; import from `node_modules/renovate-workflow/scripts/lib/…` when shelling out |
| Stop causes | `scripts/lib/derive-stop-causes.ts` | Classifier § packet emission |
| Investigation eligibility | `scripts/lib/renovate-investigation-eligibility.ts` | Classifier § handoff (mandatory) |
| Policy facts | `scripts/lib/renovate-policy-facts.ts` | Classifier + maintainer |

Classifier §2.7 (`/renovate-loop --babysit`) is the only skill path that shells out to the freshness poll CLI.

**Verified:** npm devDependency on `@multipliers-dev/renovate-workflow` (or interim git install + `tsx`). Full-tree vendoring **not required**.

---

## Minimum local boundary (conclusion)

```text
renovate-workflow (marketplace + plugin + npm package)   Consumer repo (facts + runtime)
├── .cursor-plugin/marketplace.json                        ├── .agents/renovate-policy.yml  ← required
├── .cursor-plugin/plugin.json                             ├── renovate.json
├── skills/                                        ├── .github/workflows/renovate.yml
├── .agents/ (portable prompts, rubric)                    ├── .gitignore → .agent-runs/renovate/
├── docs/                                                  └── package.json devDeps:
├── scripts/ (legacy git surface)                              @multipliers-dev/renovate-workflow (npm)
└── package.json                                               renovate-workflow freshness-poll (CLI)
```

**Not required in consumer:** vendored skills, runbook, agent prompts, rubric base, or script lib copies.

**Install flow:** [adopt.md](adopt.md).
