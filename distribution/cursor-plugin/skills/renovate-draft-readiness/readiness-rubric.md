# Draft readiness rubric

Apply only within the **renovate-draft-readiness** skill. Verdicts are advisory for human unpark decisions — this skill never changes draft state, merges, or updates branches.

## Evidence dimensions

Gather and score each dimension for the selected draft PR. Cite concrete evidence (peer ranges, CI log excerpts, file lists, merge state). Do not invent upstream status.

### 1. Ecosystem blockers

Peer dependency ranges, upstream issues, and release maturity that prevent a safe land even with a correct lockfile.

Examples:

- Tooling peers excluding the target major (e.g. `typescript-eslint` vs TypeScript 7)
- Missing stable Compiler API / ecosystem “not ready” signals
- Pre-release-only targets when the PR pins a stable major the ecosystem does not support yet

### 2. Incomplete Renovate diff

Manifest-only bumps missing lockfile updates, truncated grouped updates, or other incomplete Renovate output that would fail install/CI immediately.

### 3. CI state

Failing / pending / green on the **current** `head_sha` (including install failures). Prefer check runs / `gh pr checks`. Report unknown honestly when Checks API is unavailable.

### 4. Branch freshness

Report `mergeStateStatus` (`BEHIND` / `CLEAN` / `BLOCKED` / `DIRTY` / `UNKNOWN`) and related mergeability vs the default base (`main`).

**Do not** run `gh pr update-branch`, rebase, or otherwise sync the branch. Staleness is evidence for the comment, not an action trigger.

### 5. Policy classification preview (advisory)

Lightweight **risk-class / likely ladder route** label only. Draft readiness verdicts (`remain_draft` / `ready_to_unpark` / `needs_human`) always win over any ladder preview.

**Allowed sources (read-only subsets):**

- Consumer [`.agents/renovate-policy.yml`](../../../.agents/renovate-policy.yml) — `packages.high_touch`, `packages.low_risk_tooling`, `repo.sensitive_paths`, `repo.analytics_paths`, `repo.auth_paths` for package/path buckets
- [policy-rubric.base.md](../../agents/policy-rubric.base.md) — `risk_class` column of [Rubric outcome → packet fields](../../agents/policy-rubric.base.md#rubric-outcome--packet-fields) to name the likely ladder route
- [`scripts/lib/renovate-policy-facts.ts`](node_modules/renovate-workflow/scripts/lib/renovate-policy-facts.ts) — programmatic package/path lookup when helpful

**Forbidden from classifier rubric (classifier-only):**

- “Apply this rubric only within the renovate-classifier skill workflow” deliverables
- Recommendation mapping outcomes: **merge** / **review manually** / **defer**
- Execution packets, `decision`, `merge_authority`, `stop_causes`

**Preview labels** (examples): `high_touch_tooling`, `unlisted_package`, `low_risk_tooling`, `low_risk_tooling_major`, `runtime_framework`, `github_action_major` — state uncertainty when evidence is thin. Phrase as “likely ladder risk class after unpark,” never as a merge recommendation that could contradict the draft verdict.

## Verdicts

| Verdict           | When                                                                                                   | Operator implication                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `remain_draft`    | One or more leave-draft blockers persist (ecosystem and/or incomplete diff that is not the only issue) | Keep parked; state unblock criteria clearly                                     |
| `ready_to_unpark` | No leave-draft blockers remain; CI/install would be expected to proceed after normal ladder freshness  | Recommend human **Ready for review**; then normal `/renovate-classifier` / loop |
| `needs_human`     | Incomplete evidence, contradictory signals, or ambiguous blockers                                      | Ask human to inspect; still publish the managed comment with gaps listed        |

### Leave-draft blockers (keep `remain_draft`)

Treat as leave-draft blockers when any of the following hold with solid evidence:

- Ecosystem peer/API incompatibility for the bump
- Upstream explicitly not supporting the target yet
- Incomplete Renovate diff **and** fixing the lockfile alone would not clear ecosystem blockers
- CI install/type failures that are structural to the bump (not mere `BEHIND` staleness)

`BEHIND` alone does **not** force `remain_draft` — report it, but do not treat base lag as an ecosystem blocker. This skill still must not update the branch.

### `ready_to_unpark` bar

All of:

- No ecosystem leave-draft blockers
- Diff is complete enough for a normal ladder run (or only trivial freshness/CI-pending remain)
- Unpark recommendation is explicit: human marks **Ready for review**; skill does not call `gh pr ready`

### Incomplete Renovate diff alone

- If the **only** issue is a missing lockfile and ecosystem peers already allow the bump → prefer `ready_to_unpark` or `needs_human` (if CI unknown), with unblock note “regenerate lockfile / let Renovate retry after unpark” — still do not edit the branch
- If missing lockfile **plus** ecosystem blockers → `remain_draft`

## Comment voice

Match the #436 house voice:

- Direct, evidence-first, numbered sections
- State what would **not** be enough (e.g. lockfile-only fix)
- End with clear park/unpark guidance without closing the PR
- See [comment-template.md](comment-template.md)
