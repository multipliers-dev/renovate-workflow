# Distribution discovery (PR2 Phase A)

Evidence for the minimum local boundary when adopting the Renovate ladder via **direct Cursor plugin install** from [renovate-workflow](https://github.com/multipliers-dev/renovate-workflow) — without vendoring the full ~40-file tree or routing through a separate marketplace mirror repo.

**Precedent:** Cursor single-plugin repos with `.cursor-plugin/plugin.json` at the repository root ([Cursor plugins reference](https://cursor.com/docs/reference/plugins)). Multi-plugin `.cursor-plugin/marketplace.json` is only for one repo hosting **multiple** plugins; optional org catalogs (e.g. cursor-team-marketplace) are not required for installation.

---

## Plugin resolution (this repo is the plugin)

| Asset | Plugin-only? | Evidence |
| --- | --- | --- |
| **Skills** (5 × `renovate-*`) | **Yes** | Manifest `"skills": ".cursor/skills"`; invoke via `/renovate-classifier`, etc. Full-repo GitHub install clones skills with the plugin ([Cursor component discovery](https://cursor.com/docs/reference/plugins)). |
| **Runbook** (`docs/renovate-workflow.md`) | **Yes** | Shipped in the same repo clone; skill/agent cross-links use relative paths. |
| **Portable rubric** (`policy-rubric.base.md`) | **Yes (via plugin)** | Lives in `.agents/`; classifier skills link `../../../.agents/policy-rubric.base.md`. |
| **Policy template** (`renovate-policy.template.yml`) | **Yes (via plugin)** | Bootstrap only; consumer copies to `.agents/renovate-policy.yml`. |
| **Agent prompts** (`renovate-maintainer.md`, `renovate-investigator.md`) | **Plugin + skill invoke** | Manifest `"agents": ".agents"`. `@.agents/` in copy/paste blocks resolves from the **consumer workspace**, not plugin cache. **Mitigation:** invoke `/renovate-maintainer` and `/renovate-investigator`. |
| **Report templates** (`.agents/templates/*.md`) | **Yes (via plugin)** | Reports written under consumer `.agent-runs/renovate/`; template content read from plugin `.agents/templates/` via skill links. |
| **Executable scripts** (`scripts/lib/*`, freshness poll CLI) | **No — npm/git dep on same repo** | Skills shell out with workspace-relative paths; consumer adds `renovate-workflow` + `tsx` devDependencies and runs `tsx node_modules/renovate-workflow/scripts/…`. No script vendoring. |

---

## Consumer-workspace access to `.agents/renovate-policy.yml`

Classifier, maintainer, loop, and investigator skills **must read** consumer `.agents/renovate-policy.yml` from the **active workspace** (see `.cursor/skills/renovate-classifier/SKILL.md` §1).

Repo-specific facts (package lists, CI bindings, `repo.renovate_branch_prefix`) **cannot** live only in plugin cache.

**Bootstrap:** copy `.agents/renovate-policy.template.yml` from the installed plugin (or `node_modules/renovate-workflow/.agents/`) → consumer `.agents/renovate-policy.yml`. Example: [`examples/example-repo/renovate-policy.yml`](../examples/example-repo/renovate-policy.yml).

Portable interpretation stays in plugin `.agents/policy-rubric.base.md`.

---

## Freshness-poll and guardrail invocation paths

| Primitive | Path in this repo | Consumer invocation |
| --- | --- | --- |
| Freshness poll CLI | `scripts/renovate-freshness-poll.ts` | `npm run renovate:freshness-poll -- --repo … --pr … --expected-head …` |
| Babysit core | `scripts/lib/renovate-freshness-poll.ts` | Imported by CLI |
| Guardrails | `scripts/lib/renovate-guardrails.ts` | Agent follows skill prose; import from `node_modules/renovate-workflow/scripts/lib/…` when shelling out |
| Stop causes | `scripts/lib/derive-stop-causes.ts` | Classifier § packet emission |
| Investigation eligibility | `scripts/lib/renovate-investigation-eligibility.ts` | Classifier § handoff (mandatory) |
| Policy facts | `scripts/lib/renovate-policy-facts.ts` | Classifier + maintainer |

Classifier §2.7 (`/renovate-loop --babysit`) is the only skill path that shells out to the freshness poll CLI.

**Verified:** git/npm devDependency on this repo + `tsx`. Full-tree vendoring **not required**.

---

## Minimum local boundary (conclusion)

```text
renovate-workflow (plugin + npm package)     Consumer repo (facts + runtime)
├── .cursor-plugin/plugin.json               ├── .agents/renovate-policy.yml  ← required
├── .cursor/skills/                          ├── renovate.json
├── .agents/ (portable prompts, rubric)      ├── .github/workflows/renovate.yml
├── docs/                                    ├── .gitignore → .agent-runs/renovate/
├── scripts/                                 └── package.json devDeps:
└── package.json                                 renovate-workflow (github:…)
                                                 tsx
```

**Not required in consumer:** vendored skills, runbook, agent prompts, rubric base, or script lib copies.

**Install flow:** [adopt.md](adopt.md).
