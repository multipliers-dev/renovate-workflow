# Distribution discovery (PR2 Phase A)

Evidence for the minimum local boundary when adopting the Renovate ladder via Cursor Team Marketplace instead of vendoring the full ~40-file tree from [renovate-workflow](https://github.com/multipliers-dev/renovate-workflow).

**Precedent:** [multipliers-dev/cursor-team-marketplace](https://github.com/multipliers-dev/cursor-team-marketplace) `team-harness` plugin (public, v1.8.0).

---

## Plugin-cache resolution

| Asset | Plugin-only? | Evidence |
| --- | --- | --- |
| **Skills** (5 × `renovate-*`) | **Yes** | team-harness ships `skills/*/SKILL.md`; README documents invoke via `/planning-methodology`, `/repo-bootstrap`, `/cloud-hooks-bootstrap`. No consumer copy required for skill discovery. |
| **Runbook** (`docs/renovate-workflow.md`) | **Yes** | team-harness embeds methodology in the planning skill + `reference.md`; runbook ships in plugin `docs/` for `@` / skill cross-links. |
| **Portable rubric** (`policy-rubric.base.md`) | **Yes (via plugin)** | Classifier skills link to rubric with relative paths. Plugin copy rewrites canonical `../../../.agents/` → `../../agents/` so links resolve inside the installed plugin tree. |
| **Policy template** (`renovate-policy.template.yml`) | **Yes (via plugin)** | Referenced for bootstrap only; consumer copies to `.agents/renovate-policy.yml` once. |
| **Agent prompts** (`renovate-maintainer.md`, `renovate-investigator.md`) | **Plugin + skill invoke** | Runbook and skills use `@.agents/renovate-maintainer.md` copy/paste blocks. **`@.agents/` resolves from the consumer workspace**, not plugin cache (team-harness has no `.agents/` surface; no counter-example). **Mitigation:** invoke `/renovate-maintainer` and `/renovate-investigator` skills (plugin-installed); plugin ships full agent docs under `agents/` for skill cross-links. Plugin sync rewrites `@.agents/…` → `` `/renovate-maintainer` `` in copy/paste blocks. |
| **Report templates** (`agents/templates/*.md`) | **Yes (via plugin)** | Maintainer/investigator write gitignored reports under `.agent-runs/renovate/` in the **consumer** repo; template **content** is read from plugin `agents/templates/` via skill/agent links (rewritten paths). |
| **Executable scripts** (`scripts/lib/*`, `renovate-freshness-poll.ts`) | **No — npm/git dep** | Skills/agents invoke `npm exec -- tsx scripts/…` (workspace-relative). team-harness **cloud-hooks-bootstrap** explicitly requires copying `scripts/` from the installed plugin into the consumer repo for runtime execution. **Lighter option verified:** add `renovate-workflow` as a devDependency (GitHub/git) and call `tsx node_modules/renovate-workflow/scripts/…` — no script vendoring, no Codenames coupling. |

---

## Consumer-workspace access to `.agents/renovate-policy.yml`

Classifier, maintainer, loop, and investigator skills **must read** consumer `.agents/renovate-policy.yml` from the **active workspace** (see `.cursor/skills/renovate-classifier/SKILL.md` §1 “Resolve repository and load consumer policy”).

This file holds repo-specific facts (package lists, CI bindings, `repo.renovate_branch_prefix`, etc.). It **cannot** live only in plugin cache.

**Bootstrap:** copy `renovate-policy.template.yml` from plugin `agents/` → consumer `.agents/renovate-policy.yml`, then customize. Synthetic example: [`examples/example-repo/renovate-policy.yml`](../examples/example-repo/renovate-policy.yml).

Portable interpretation stays in plugin `agents/policy-rubric.base.md`.

---

## Freshness-poll and guardrail invocation paths

| Primitive | Canonical path | Consumer invocation |
| --- | --- | --- |
| Freshness poll CLI | `scripts/renovate-freshness-poll.ts` | `npm exec -- tsx node_modules/renovate-workflow/scripts/renovate-freshness-poll.ts --repo … --pr … --expected-head …` |
| Babysit core | `scripts/lib/renovate-freshness-poll.ts` | Imported by CLI only (tests in canonical repo) |
| Guardrails | `scripts/lib/renovate-guardrails.ts` | `npm exec -- tsx -e "import … from 'renovate-workflow/scripts/lib/renovate-guardrails.ts'"` or inline via agent following skill prose |
| Stop causes | `scripts/lib/derive-stop-causes.ts` | Classifier skill § packet emission |
| Investigation eligibility | `scripts/lib/renovate-investigation-eligibility.ts` | Classifier § handoff routing (mandatory) |
| Policy facts | `scripts/lib/renovate-policy-facts.ts` | Classifier + tests |

Classifier §2.7 (`/renovate-loop --babysit`) is the only skill prose path that shells out to the freshness poll CLI. All other guardrail calls are TypeScript imports referenced in skill/agent prose for agent execution.

**Verified lighter path:** Git/npm install of `renovate-workflow` + consumer `tsx` devDependency. Full `install-to-repo.sh` tree vendoring **not required**.

---

## Minimum local boundary (conclusion)

```text
Cursor plugin (distribution)          Consumer repo (facts + runtime)
├── skills/                           ├── .agents/renovate-policy.yml   ← required
├── agents/                           │   (from plugin template)
│   ├── policy-rubric.base.md         ├── renovate.json
│   ├── *.md prompts                  ├── .github/workflows/renovate.yml
│   ├── templates/                    ├── .gitignore → .agent-runs/renovate/
│   └── renovate-policy.template.yml  └── package.json devDeps:
└── docs/                                 renovate-workflow (git/github)
                                          tsx (run scripts under node_modules/…)
```

**Not required in consumer:** vendored skills, runbook, agent prompts, rubric base, or script lib copies.

**Install flow:** [adopt.md](adopt.md).
