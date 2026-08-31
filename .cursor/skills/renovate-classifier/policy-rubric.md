# Renovate review policy

Apply this rubric within the **renovate-classifier** skill workflow. **Consumer package lists and CI bindings** live in `.agents/renovate-policy.yml` (see [policy-rubric.base.md](../../../.agents/policy-rubric.base.md)). The lists below are reference examples — consumer repos must configure their own allowlists in policy YAML.

## Review policy (verbatim)

High-level summary of the original review policy. **Classification must follow [Recommendation mapping](#recommendation-mapping), [Safe to merge](#safe-to-merge-recommend-merge), [Needs human review](#needs-human-review-recommend-review-manually), [Defer](#defer-recommend-defer), and [Package lists](#package-lists) below** — not this summary alone.

### Safe to merge if

- PR is from Renovate (see **Renovate identity** below).
- CI is green.
- Changes are limited to package versions, lockfile updates, or GitHub Action version pins.
- No source code, prompt, server logic, game rules, analytics semantics, or workflow behavior changed unexpectedly.
- Release notes do not mention breaking changes.

### Needs human review if

- Major version update (**except** low-risk tooling devDependency majors meeting **Low-risk tooling major → agent review** below).
- GitHub Actions major update.
- Playwright/browser tooling update.
- OpenAI SDK update.
- Express, Zod, Vite, React, PostHog, or other runtime/framework update.
- Any CI failure or flaky visual/a11y/e2e test.
- Any lockfile change looks unexpectedly large.

(Non-exhaustive — see **Needs human review** below for high-touch packages, unlisted packages, sensitive paths, unknown CI, grouped-PR rules, and other triggers.)

### Per-PR deliverables

For each PR:

1. Summarize what changed.
2. Identify risk level: low / medium / high.
3. Check CI status.
4. Inspect package-lock.json impact.
5. Note any release-note concerns if available.
6. Recommend: merge / review manually / defer.

**Do not merge anything.** Produce a concise review table and then detailed notes per PR.

---

## Recommendation mapping

| Classification                                     | Recommendation      | Packet `decision` (when applicable) |
| -------------------------------------------------- | ------------------- | ----------------------------------- |
| Safe to merge (all gates below)                    | **merge**           | `auto_merge_eligible`               |
| Low-risk tooling major → agent review (gates pass) | **review manually** | `agent_review_required`             |
| Needs human review                                 | **review manually** | `human_required`                    |
| Should be deferred                                 | **defer**           | `defer`                             |

**Precedence:** any defer trigger → `defer`; else any human-review trigger (major semver applies **except** low-risk tooling devDep majors meeting **Low-risk tooling major → agent review**) → `review manually`; else if **at least one major semver bump** and **Low-risk tooling major → agent review** gates pass → human table **review manually**, packet `agent_review_required`; else if **all Safe to merge** gates below are satisfied → `merge`; else → `review manually`.

---

## Renovate identity (Renovate-authored PR)

A PR counts as **Renovate-authored** when included by **renovate-classifier** discovery ([SKILL.md](SKILL.md) §2), including:

- **Self-hosted** (this repo): `head.ref` starts with `renovate/` — opened by the Renovate PAT owner, **not** `app/renovate`; that author is expected.
- **Hosted / GitHub App**: author is `app/renovate` (head branch may differ).

Do **not** fail the Renovate identity gate solely because `user.login` is not `app/renovate` when the PR was discovered via head-branch (`renovate/`).

---

## Renovate grouped dependency PRs (renovate-classifier skill only)

**Scope:** This grouped-PR logic applies **only** within the **renovate-classifier** skill workflow. Do not change general handling of grouped PRs elsewhere (e.g. babysit, manual review habits, other skills).

Grouped PRs are **not** automatically `review manually`. Evaluate each grouped Renovate PR against the shared safe-merge gates in **Safe to merge** below, plus the group-specific rules here.

### Grouped PR → merge

When **all** of the following are true:

- Renovate-authored PR (see **Renovate identity** above)
- **Every** package in the group is a **patch or minor** update (no major bumps)
- **Every** package is **low-risk tooling or a devDependency** (see package lists below; not runtime/framework)
- CI green
- Changed files limited to `**/package.json`, `package-lock.json`, or dependency version pins in `.github/workflows/*.yml`
- No breaking-change signals in release notes
- Lockfile impact within normal thresholds

### Grouped PR → review manually

When **any** of:

- The group contains **runtime or framework** packages (dependencies, not devDependencies)
- The group contains **high-touch** packages (see list below)
- The group contains any **unlisted** package (see **Unlisted packages** below)
- Any package in the group is a **major** semver bump, **except** when **every** major in the group is a low-risk tooling devDependency and all **Low-risk tooling major → agent review** gates pass (same manifest/lockfile-only constraints as single-package carve-out)
- Lockfile impact is unusually large (thresholds below)
- CI is not green
- Release notes indicate breaking changes

### Renovate group names (hints only)

From `renovate.json`: `frontend react-vite`, `testing`, `typescript and linting`, `github actions`, `radix ui`.

Classify by **package contents and bump type**, not by group label alone.

- Example **merge:** `typescript and linting` group with only patch bumps to `prettier` + `@types/node` + green CI.
- Example **review manually:** `testing` group touching `@playwright/test` minor bump.

### Grouped PR → agent review

Grouped Renovate PR with **at least one major semver bump** where **every** bumped package is a low-risk tooling **devDependency**, **every major** in the group satisfies the low-risk tooling devDep major carve-out, and all **Low-risk tooling major → agent review** gates pass (same manifest/lockfile-only constraints as single-package carve-out):

- → Human table recommendation may remain `review manually`
- → Packet `decision: agent_review_required`, `merge_authority: allowed_if_no_code_changes`, `risk_class: low_risk_tooling_major` (same packet shape as single-package carve-out)

When **every** major in the group satisfies the carve-out, **Grouped PR → agent review** wins over **Grouped PR → review manually**; mixed groups (any non-qualifying major, runtime dep, or high-touch package) remain `review manually`.

---

## Low-risk tooling major → agent review

Single-package or grouped Renovate PR where **all** of the following are true:

- **At least one** bumped package has a **major** semver bump (grouped PRs: see **Grouped PR → agent review** — patch/minor-only groups use **Grouped PR → merge** or **Safe to merge**, not this path)
- All bumped packages ∈ **Low-risk tooling** list (not high-touch, not unlisted)
- All bumped packages are devDependencies
- Changed files limited to `**/package.json` and `package-lock.json` (**no** `.github/workflows/*.yml` — workflow pin PRs use `github_action_pin_same_major` / `allowed`, not this carve-out)
- CI green, lockfile within threshold, no sensitive paths, no breaking notes

→ Human table recommendation may remain `review manually`; packet `decision: agent_review_required`, `merge_authority: allowed_if_no_code_changes`, `risk_class: low_risk_tooling_major`.

High-touch majors (e.g. `eslint`, `typescript`) and runtime majors remain **review manually** with no carve-out.

---

## Safe to merge (recommend: merge)

All must be true (single-package **and** grouped Renovate PRs):

- Renovate-authored PR (see **Renovate identity** above)
- CI green — all relevant check runs `completed` + `success`; treat `neutral`/`skipped` as non-blocking only when expected
- Files limited to: `**/package.json`, `package-lock.json`, `.github/workflows/*.yml` (version pin lines only)
- No edits under sensitive paths (below)
- No breaking-change signals in release notes
- Lockfile delta within normal bounds (below)
- For **grouped** PRs: additionally satisfy all gates in **Grouped PR → merge** above

---

## Needs human review (recommend: review manually)

Any of (single-package **or** grouped Renovate PR):

- Major semver bump (any package in the PR), **except** low-risk tooling devDependency majors meeting **Low-risk tooling major → agent review** above
- GitHub Actions **major** version update (e.g. `v5` → `v6`)
- Updates to high-touch packages (list below)
- Updates to **unlisted packages** (see **Unlisted packages** below)
- Runtime/framework dependency updates (even minor)
- Grouped PR triggers in **Grouped PR → review manually** above
- CI failure, pending, cancelled, or **unknown/unverified** checks (e.g. `get_check_runs` 403, MCP failure, report cell `unknown`)
- Flaky signals: e2e/visual/a11y-related check names failing or “flaky” in logs/annotations
- Lockfile change exceeds threshold (below)
- Unexpected non-version files touched
- Any edit under **Sensitive paths** (below)

---

## Defer (recommend: defer)

- Draft PR or failing CI with no quick fix path
- Breaking changes in release notes
- Unexpected source/prompt/workflow-logic changes
- Conflicting/overlapping Renovate PRs (same package bumped twice)
- Major runtime stack update when multiple related PRs should land together

---

## Package lists

Each package belongs to **exactly one** category below. When classifying a PR, look up each package once — recommendations must not depend on rule ordering.

### High-touch (always review manually when updated)

`openai`, `express`, `zod`, `vite`, `react`, `react-dom`, `@vitejs/plugin-react`, `posthog-js`, `@playwright/test`, `@axe-core/playwright`, `typescript`, `vitest`, `eslint`, `typescript-eslint`, `@vitest/eslint-plugin`, `tailwindcss`, `@tailwindcss/vite`

Also treat as high-touch: GitHub Actions **major** updates (see **GitHub Actions** below); Playwright/browser tooling updates.

### Low-risk tooling / devDependencies (eligible for grouped merge)

When **all** packages in a grouped PR are patch/minor and from this category only:

- `@types/*` (e.g. `@types/node`, `@types/react`, `@types/express`, `@types/cors`, `@types/supertest`, `@types/jest-axe`)
- `eslint-config-prettier`
- `@eslint/js`
- `prettier`
- `prettier-plugin-tailwindcss`
- `husky`
- `lint-staged`
- `concurrently`
- `harness-score`
- `yaml` (root devDependency; `scripts/lib/devto-article.ts` frontmatter only)

GitHub Actions **patch/minor** version pins within the same major (see **GitHub Actions** below) are also eligible when changed files are limited to workflow version pins.

### Runtime / framework (review manually even on minor bump)

Any package in `dependencies` (not `devDependencies`) in root, `server/`, or `frontend/`, including but not limited to: `cors`, `react`, `react-dom`, `vite`, `express`, `openai`, `zod`, `posthog-js`, `tailwindcss`, `@radix-ui/*`, `@vercel/analytics`, `@vercel/speed-insights`, UI libs (`clsx`, `tailwind-merge`, `lucide-react`, `vaul`, etc.).

### Unlisted packages (review manually)

Any package not listed in **High-touch**, **Low-risk tooling**, or **Runtime / framework** above — e.g. `tsx`, `dotenv`, `@vitest/coverage-v8`, `@testing-library/*`, `jsdom`, `supertest` — is **review manually**. Not eligible for grouped **merge** or auto-merge. Investigation-eligible when classifier `stop_causes` are only the policy allowlist for `unlisted_package`; dependency-only `allowed_paths` still gate investigation-approved merge, not investigation routing.

---

## GitHub Actions

Applies to `uses:` version pin changes in `.github/workflows/*.yml` only (single-line pin bumps; no workflow logic changes).

Compare **major** version numbers in the pin (e.g. `@v6`, `@v6.1.15` → major `6`).

### Safe to merge (patch/minor within same major)

- `actions/checkout@v6.0.0` → `actions/checkout@v6.1.15`
- `actions/setup-node@v6.0.0` → `actions/setup-node@v6.1.15`
- Other patch/minor updates within the same major version (e.g. `v6.x` → `v6.y`, `v5.2.0` → `v5.4.1`)

Requirements: Renovate-authored PR (see **Renovate identity** above), CI green, only workflow version-pin lines changed, no breaking-change signals in release notes.

### Review manually (major version bump)

- `actions/checkout@v6` → `actions/checkout@v7`
- `actions/setup-node@v6` → `actions/setup-node@v7`
- Any GitHub Actions major version bump (first numeric segment increases: `v5` → `v6`, `v6` → `v7`, etc.)

Major Action bumps are **high-touch** and never eligible for grouped **merge**, even when grouped with low-risk npm packages.

---

## Sensitive paths

Renovate PRs touching these paths are **never** safe to merge:

| Area                 | Paths                                                           |
| -------------------- | --------------------------------------------------------------- |
| Prompts / AI         | `server/src/lib/prompt/**`, `server/src/ai/**`                  |
| Server logic / rules | `server/src/**`                                                 |
| Game UI logic        | `frontend/src/**`                                               |
| Analytics semantics  | `frontend/src/lib/posthog.ts`, PostHog capture call sites       |
| Workflow behavior    | `.github/workflows/**` beyond single-line `uses:` version bumps |
| Renovate config      | `renovate.json` (always human review)                           |

Allowed without triggering sensitive-path review: changes confined to `**/package.json`, `package-lock.json`, and single-line Action version pins in workflows.

---

## Lockfile impact

From `pull_request_read` `get_files`, report `package-lock.json` **additions + deletions** as combined line delta. Also record total PR file count (`pr_file_count`) for single-package gates.

**Derive `lockfile_maintenance`** when Renovate PR title/body indicates lock file maintenance (e.g. "Lock file maintenance") **or** changed files are lockfiles only with no `package.json` version bumps.

Set **`line_delta_limit`** to **2000** when `lockfile_maintenance: true`, else **800**.

Flag **unexpectedly large** (→ review manually; packet `within_threshold: false`, `risk_class: large_lockfile`) if **any**:

- Combined line delta **>** `line_delta_limit` (not a flat 800 for maintenance PRs)
- **> 30** files changed (`pr_file_count`) in a **single-package** PR (`package_count == 1`)

Note which workspace roots changed: `/` (root), `server/`, `frontend/`.

Large lockfile alone → **review manually** (not defer unless combined with other defer triggers).

---

## CI interpretation (this repo)

Merge-blocking check: **`CI` / `test`** job in `.github/workflows/ci.yml`.

Treat as blocking failures: lint, format, typecheck, build, unit tests, e2e (`npm run test:e2e`), coverage.

E2e/visual/a11y failure or Playwright artifact upload on failure → strong signal for **review manually**.

Renovate-only workflows (`renovate.yml`, `validate-renovate-config.yml`) are not merge gates unless their checks appear on the PR.

---

## Risk level mapping

| Risk       | Typical signals                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **low**    | Patch/minor devDependency or Action pin; green CI; manifest/lockfile-only; single package **or** grouped low-risk dev tooling meeting all merge gates |
| **medium** | Minor runtime dep; grouped PR with mixed dev+runtime packages; moderate lockfile churn; green CI                                                      |
| **high**   | Major bump; high-touch runtime; CI red/pending; large lockfile; breaking notes; sensitive paths touched                                               |

When uncertain between two risk levels, choose the higher level and explain in rationale.

---

## Breaking-change signals

Treat as breaking (→ review manually or defer):

- Release notes mention `BREAKING`, breaking change, migration required
- Major semver bump (first number increased), **except** low-risk tooling devDependency majors meeting **Low-risk tooling major → agent review** (human table may remain review manually; not treated as breaking for packet derivation when carve-out gates pass)
- GitHub Actions major version bump
- Renovate body flags `⚠️` or “These dependencies are outdated” with major upgrade guidance

Absence of release notes is **not** proof of safety; still apply file-path and package-class rules.

---

## Packet derivation

Derive execution packet fields from the rubric gates above. Full schema: [packet-schema.md](packet-schema.md). Do not duplicate the rubric — map outcomes to packet fields.

Set `policy_version` on every per-PR packet from `version` in consumer `.agents/renovate-policy.yml`. The maintainer agent stops if the packet version does not match live policy at preflight or immediately before merge.

### Rubric outcome → packet fields

| Rubric outcome                                                                                   | `decision`              | `merge_authority`            | `risk_class`                                                      |
| ------------------------------------------------------------------------------------------------ | ----------------------- | ---------------------------- | ----------------------------------------------------------------- |
| Safe to merge — lockfile-only or lockfile maintenance **within rubric thresholds**               | `auto_merge_eligible`   | `allowed`                    | `lockfile_patch`                                                  |
| Safe to merge — low-risk devDep patch/minor only (see **Low-risk tooling** list; not high-touch) | `auto_merge_eligible`   | `allowed`                    | `low_risk_tooling_patch`                                          |
| Safe to merge — GitHub Actions patch/minor pin within same major (`uses:` lines only)            | `auto_merge_eligible`   | `allowed`                    | `github_action_pin_same_major`                                    |
| **Low-risk tooling major → agent review** (single or grouped carve-out)                          | `agent_review_required` | `allowed_if_no_code_changes` | `low_risk_tooling_major`                                          |
| High-touch package (any bump)                                                                    | `human_required`        | `denied`                     | `high_touch_tooling`                                              |
| GitHub Actions **major** version bump (`v6` → `v7`)                                              | `human_required`        | `denied`                     | `github_action_major`                                             |
| Runtime/framework dependency (any bump)                                                          | `human_required`        | `denied`                     | `runtime_dependency`                                              |
| Unlisted package                                                                                 | `human_required`        | `denied`                     | `unlisted_package`                                                |
| Lockfile exceeds rubric thresholds (see **Lockfile impact** below)                               | `human_required`        | `denied`                     | `large_lockfile`                                                  |
| Analytics semantics paths touched                                                                | `human_required`        | `denied`                     | `analytics_or_telemetry`                                          |
| Auth/security paths touched                                                                      | `human_required`        | `denied`                     | `auth_or_security`                                                |
| Other sensitive paths (`server/src/**`, `frontend/src/**`, prompts, workflow logic)              | `human_required`        | `denied`                     | `sensitive_path_change`                                           |
| `renovate.json` changed                                                                          | `human_required`        | `denied`                     | `renovate_config_change`                                          |
| Defer triggers                                                                                   | `defer`                 | `denied`                     | (inherit from evidence; prefer highest-severity applicable class) |

Map `classification.recommendation` from the human table: `merge` → same row's `decision`; `review manually` → may still be `agent_review_required` when the low-risk tooling major carve-out applies; `defer` → `defer`.

### Precedence

High-touch and GitHub Actions major rules override generic patch/minor paths. A PR touching `eslint` (high-touch) is never `low_risk_tooling_patch` or `low_risk_tooling_major`, even on a patch/major bump. Low-risk tooling major carve-out overrides the blanket major-semver → review manually rule only when **Low-risk tooling major → agent review** gates all pass. For **grouped** PRs, when **every** major in the group satisfies the carve-out, **Grouped PR → agent review** wins over **Grouped PR → review manually**; mixed groups remain `human_required`.

### Lockfile fields

- Derive `lockfile_maintenance` per **Lockfile impact** above.
- Set `line_delta_limit` to **2000** when `lockfile_maintenance: true`, else **800**.
- Set `within_threshold: false` and populate `threshold_flags` when **any** threshold in **Lockfile impact** fires (compare `line_delta_total` to `line_delta_limit`, not a flat 800). Never assign `lockfile_patch` when `within_threshold: false`.
- Use `pr_file_count` (total files from `get_files`) for the `files_over_30` gate — not `lockfile_paths_changed`.

### Sensitive paths and watch-list keys

When any sensitive path is touched, also set `triggered_human_required: [implementation_changes_required]` and pick the matching `risk_class` from the analytics/auth/sensitive_path_change rows above.

Populate `triggered_human_required` from definitive rubric triggers at classification time; keep `human_required_if` as the full latent watch list. Set `stop: true`, `stop_reason`, and **`stop_causes`** when `triggered_human_required` is non-empty **or** `decision` is `human_required` or `defer` (aligns with [SKILL.md](SKILL.md) §5). Derive `stop_causes` with [`scripts/lib/derive-stop-causes.ts`](../../../scripts/lib/derive-stop-causes.ts) — see [packet-schema.md — Stop causes](packet-schema.md#stop-causes-stop_causes).

### Workflow changes

When `.github/workflows/*.yml` is touched, populate `evidence.workflow_changes.uses_pin_only` and `same_major_only` from the diff. Non-`uses:` edits or Action major bumps: set `risk_class: github_action_major`, `triggered_human_required: [implementation_changes_required]`.

### Required checks

Assemble `required_checks` per [packet-schema.md — Check assembly](packet-schema.md#required_checks-assembly-classifier): always `pr_ci_green` and `post_merge_main_ci_green`; add conditional checks only when applicable changed files are present.
