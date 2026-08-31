---
name: renovate-classifier
description: >-
  Reviews one open Renovate dependency PR per run (FIFO queue or explicit PR
  number) via GitHub MCP (prefer) or gh fallback; base freshness gate with
  gh pr update-branch when BEHIND; classifies as safe to merge, needs human
  review, or defer. Use when the user asks for renovate review, dependency PR
  triage, or /renovate-classifier.
disable-model-invocation: true
---

# Renovate review

Review **one open Renovate PR per run** in the active repository. **Prefer GitHub MCP** when connected; **fallback** to `gh` for read-only discovery/analysis and for the bounded **`gh pr update-branch`** write exception (§2.7). Classify the selected PR; **do not merge**, approve, comment, or close anything.

When invoked by `/renovate-loop --babysit`, the branch-update freshness gate may remain attached through bounded post-update GitHub settling and required PR CI completion. Standalone `/renovate-classifier` and normal `/renovate-loop` runs do not recheck.

Classification rules: load consumer [`.agents/renovate-policy.yml`](../../../.agents/renovate-policy.yml), then apply [policy-rubric.base.md`](../../../.agents/policy-rubric.base.md) via [policy-rubric.md](policy-rubric.md). Execution packet schema: [packet-schema.md](packet-schema.md).

## Task

Process **one** Renovate PR per invocation:

1. Discover the open Renovate queue and build the **active** (non-draft) set (read-only).
2. Select the target PR from the active set (FIFO lowest number, or explicit `#` from the user prompt).
3. Run the **base freshness gate** before expensive fetches; update branch if `BEHIND`.
4. For the selected PR only: summarize changes, risk, CI, lockfile impact, release notes.
5. Recommend: merge / review manually / defer.
6. Post a **queue overview**, **one-row summary table**, **detailed notes for the selected PR**, and **one execution packet**.

Re-run `/renovate-classifier` after the maintainer step to process the next FIFO item — or use `/renovate-loop` to orchestrate repeated classify → maintainer cycles.

## Steps

### 0. Preflight (GitHub MCP or `gh`)

1. Confirm the GitHub MCP server is available (typically named `github` in **Cursor Settings → MCP**), **or** that authenticated `gh` is on PATH (`gh auth status` succeeds).
2. **When MCP is connected:** read tool schemas before calling. Verify these tools exist: `list_pull_requests`, `pull_request_read` (and `search_pull_requests` for hosted Renovate fallback).
3. **When MCP is unavailable but `gh` works:** use read-only `gh` for discovery and analysis (`gh pr list`, `gh pr view`, `gh pr diff`, `gh pr checks`). Map packet fields to equivalent `gh` output (e.g. `head.sha` from `gh pr view --json headRefOid`).
4. **If both GitHub MCP and `gh` are unavailable or fail:**
   - **Stop immediately.** Do not invent PRs or classify from memory.
   - Tell the user to connect GitHub MCP **or** authenticate `gh`:
     - **MCP:** enable the official [GitHub MCP server](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-cursor.md) in **Cursor Settings → MCP** (global `~/.cursor/mcp.json`):
       - **Endpoint:** `https://api.githubcopilot.com/mcp/readonly` (read-only toolset; do not commit tokens to the repo)
       - **Token (operator MCP credential — not `secrets.RENOVATE_TOKEN`):** classic personal access token with **`repo` scope only** (required for `get_check_runs` / Checks API)
       - **Observed here:** fine-grained PATs used for operator MCP returned `403` for `get_check_runs` (`403 Resource not accessible by personal access token` even with Metadata, Pull requests, Contents, and Actions Read). Use classic `repo` for operator MCP/`gh` on this path. The Renovate bot Actions secret `RENOVATE_TOKEN` (`pat_branch`) is a separate credential and may be fine-grained.
     - **`gh` fallback:** install and authenticate the [GitHub CLI](https://cli.github.com/) (`gh auth login`) with repo access for the active remote.
   - After updating MCP tokens or `gh` auth, fully quit and restart Cursor if needed, then re-run **renovate-classifier**.
5. **Forbidden write tools:** `merge_pull_request`, `pull_request_review_write`, `update_pull_request`, or any tool that merges, approves, comments, or closes PRs. No `gh pr merge`, `gh pr review`, or `gh pr close`.
6. **Allowed write exception (§2.7 only):** `gh pr update-branch <N>` when `mergeStateStatus == BEHIND`. Requires authenticated `gh` with repo **write** access. Read-only GitHub MCP **cannot** update branches — if only readonly MCP is available and the PR is `BEHIND`, stop at §2.7 and instruct the operator to authenticate `gh` with write access or update the branch manually on GitHub.

### 1. Resolve repository and load consumer policy

From the active workspace git remote, resolve `owner` and `repo` (e.g. `git remote get-url origin` → `https://github.com/{owner}/{repo}.git`). Omit hardcoded owner/repo — consumer facts live in `.agents/renovate-policy.yml` when set.

**Before any package, path, or CI classification**, read consumer `.agents/renovate-policy.yml` from the active workspace. Use:

- `packages.high_touch` / `packages.low_risk_tooling` for package lookup (supports `*` globs)
- Derived `unlisted_package` when a devDependency matches neither list; runtime scope for non-devDependencies
- `repo.sensitive_paths`, `repo.analytics_paths`, `repo.auth_paths`, and optional `repo.sensitive_path_rules` for path blast radius
- `checks.pr_ci_green` and `checks.lockfile_within_threshold.thresholds` for CI and lockfile gates
- `check_assembly` + `checks.*` for `required_checks` assembly
- `version` for packet `policy_version`

Portable interpretation logic: [policy-rubric.base.md](../../../.agents/policy-rubric.base.md). Programmatic lookup helpers: [`scripts/lib/renovate-policy-facts.ts`](../../../scripts/lib/renovate-policy-facts.ts).

If `.agents/renovate-policy.yml` is missing, **stop** and instruct the operator to copy [renovate-policy.template.yml](../../../.agents/renovate-policy.template.yml).

### 2. Discover open Renovate PRs

This repository runs **self-hosted Renovate** or **GitHub App** Renovate depending on consumer setup. For PAT + `renovate/` branch prefix (self-hosted), PRs are **authored by the PAT owner**, not `app/renovate`. Prefer **head-branch** detection when `repo.renovate_branch_prefix` is set; use **author search** for hosted Renovate / GitHub App setups.

**Active queue** = open Renovate PRs that are **not** draft. FIFO selection and explicit targeting use the active set only. Draft Renovate PRs are reported in discovery reconciliation but are not selectable. Draft FIFO for parked-draft readiness comments lives in [renovate-draft-readiness](../renovate-draft-readiness/SKILL.md) — this skill’s active-queue semantics are unchanged.

**Primary — head branch (`head-branch`):**

MCP:

```text
list_pull_requests
  owner, repo, state: open, perPage: 100, page: 1
```

Read draft/`isDraft` from each list item. When the list payload lacks draft state, follow up with `gh pr view <N> --json isDraft` or `pull_request_read` for candidate Renovate PRs before building the active queue.

**`gh` fallback:** `gh pr list --repo {owner}/{repo} --state open --json number,title,headRefName,isDraft --limit 100` (paginate with `--search` or increase limit as needed). Filter where `headRefName` starts with `renovate/`.

Paginate: repeat with `page: 2`, `page: 3`, … while a page returns 100 PRs (full page). Merge all pages before filtering. (`renovate.json` sets `prConcurrentLimit: 5`, so >100 open PRs is unlikely here, but pagination avoids silent omissions.)

From the combined result, select open PRs whose `head.ref` starts with `renovate/` (matches `branchPrefix` in `renovate.json`). Count all other open PRs as non-Renovate skipped. Then apply the draft skip rule below to build the **active** queue.

**Fallback — author search (`author-search`)** only if **zero** open PRs have `head.ref` starting with `renovate/` after filtering the list — even when `list_pull_requests` returned other open PRs (e.g. feature branches):

MCP:

```text
search_pull_requests
  query: "repo:{owner}/{repo} is:pr is:open author:app/renovate"
  perPage: 100
```

**`gh` fallback:** `gh search prs --repo {owner}/{repo} --state open --author app/renovate --json number,title,headRefName,isDraft --limit 100`

When `isDraft` is missing from search results, resolve it per PR via `gh pr view <N> --json isDraft` or `pull_request_read` before building the active queue.

Use this for Mend-hosted Renovate or the Renovate GitHub App, where PRs are authored by `app/renovate`. Accept PRs from this search even if the head branch does not start with `renovate/` (unusual but valid for some hosted configs).

**Skip rules:**

- On **head-branch** path: skip open PRs whose head branch does not start with `renovate/`.
- On **author-search** path: skip PRs not returned by the search (already filtered to `app/renovate`).
- Never classify a non-Renovate open PR (e.g. feature branches) as a Renovate PR.
- After the Renovate identity filter: **skip draft PRs** (`isDraft: true` / draft) from the active queue. Keep them in the draft-skipped report only.

**Post discovery reconciliation** (required before target selection):

```markdown
## Discovery reconciliation

- Repo: {owner}/{repo}
- Method: head-branch | author-search
- Active (non-draft) Renovate PRs: N (#123, #124, …)
- Draft Renovate PRs skipped: N (#436, …)
- Non-Renovate open PRs skipped: N
- Note: (include when relevant) Self-hosted Renovate PRs are authored by the PAT owner, not `app/renovate`; head-branch detection is used. If author-search was tried and returned zero, state that explicitly.
```

If zero **active** (non-draft) Renovate PRs after both paths — including when only draft Renovate PRs remain — report that and stop (no fabricated reviews, no packet). Run author-search when the head-branch Renovate identity filter yields zero Renovate PRs (draft or not), not only when the open-PR list is empty.

### 2.5. Select target PR

After discovery, choose **one** PR to analyze from the **active** (non-draft) set only:

| Input                                                                     | Selection rule                                             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| User prompt includes explicit PR number (e.g. `/renovate-classifier 412`) | That PR **must** be in the active (non-draft) Renovate set |
| No explicit number                                                        | **FIFO** — lowest active (non-draft) Renovate PR number    |

If the explicit PR is **not** in the active set (missing, non-Renovate, or draft) → stop with the discovery reconciliation / queue summary; do not analyze. Draft Renovate targets are invalid for selection (same stop shape as an out-of-set PR; loop tag `invalid_target_pr`).

Record `selected_pr` and `queue_remaining` (all other **active** Renovate PR numbers, ascending) for the batch envelope.

### 2.6. Base freshness gate (before §3 expensive fetches)

Run **before** per-PR file/CI/diff fetches in §3.

1. Resolve the default base branch: `gh repo view {owner}/{repo} --json defaultBranchRef` or MCP equivalent.
2. Fetch merge state for the **selected PR only**:

   **`gh`:** `gh pr view <N> --json mergeStateStatus,baseRefName,baseRefOid,headRefOid,mergeable`

   **MCP:** `pull_request_read` `method: get` — read `mergeStateStatus`, base ref, head SHA, `mergeable`.

3. Emit a **Base freshness** block in the report:

```markdown
## Base freshness

- PR: #{N}
- Base branch: {baseRefName}
- Base SHA: {baseRefOid}
- Head SHA (pre-update): {headRefOid}
- mergeStateStatus: CLEAN | BEHIND | BLOCKED | DIRTY | UNKNOWN
- mergeable: MERGEABLE | CONFLICTING | UNKNOWN
```

**Stop or defer without §3 analysis** when:

| `mergeStateStatus` | Behavior                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `CLEAN`            | Proceed to §3                                                                                       |
| `BEHIND`           | Proceed to §2.7 (branch update), then §3                                                            |
| `BLOCKED`          | Stop — report reason; do not analyze                                                                |
| `DIRTY`            | Stop — report reason; do not analyze                                                                |
| `UNKNOWN`          | Stop — pre-update `UNKNOWN`; do not guess; do not run expensive analysis (see operator block below) |

**Pre-update `UNKNOWN`:** GitHub has not finished computing mergeability — common immediately after `main` moves. Distinct from `BEHIND`, `BLOCKED`, and main CI status. `/renovate-loop --babysit` does **not** poll here; only §2.7 post-update settling uses `renovate-freshness-poll.ts`.

When stopping on pre-update `UNKNOWN`, emit this **mandatory operator block** after the **Base freshness** block (classifier-owned audit fields such as base SHA vs current `origin/main` stay in **Base freshness** — not operator steps):

```markdown
### What to do next (mergeStateStatus: UNKNOWN)

- Open PR #{N} on GitHub (or run `gh pr view {N} --json mergeStateStatus,mergeable`).
- Wait until GitHub reports a concrete `mergeStateStatus` (for example `CLEAN`, `BEHIND`, `BLOCKED`, or `DIRTY`). This usually takes only a short time.
- If it becomes `BEHIND`, re-run `/renovate-classifier` or `/renovate-loop --babysit`; the classifier will perform the normal branch-update flow.
- If it becomes `CLEAN`, re-run the command.
- If `mergeStateStatus` becomes `BLOCKED` or `DIRTY`, or `mergeable` becomes `CONFLICTING`, resolve those merge blockers before retrying.
- Babysit: {enabled_not_triggered | not_applicable} — pre-update §2.6 `UNKNOWN` occurs before the freshness helper is invoked.
```

### 2.7. Branch update if behind

When `mergeStateStatus == BEHIND`:

1. Run `gh pr update-branch <N>` — merge commit into the PR branch; **do not** pass `--rebase`.
2. Re-fetch the PR: `gh pr view <N> --json headRefOid,mergeStateStatus,baseRefOid` (or MCP `get`).
3. Update the **Base freshness** block with post-update `headRefOid` and `mergeStateStatus`. Note that CI may be **pending** after the update — the rubric handles pending CI.
4. Set `base_freshness.branch_updated: true` on the packet.

**On failure** (conflicts, permissions, `gh` not writable) → **stop**; do not analyze. Report the error clearly.

**Readonly MCP only:** if `gh` is unavailable or lacks write access, stop here and instruct the operator to authenticate `gh` with repo write access or update the branch manually on GitHub, then re-run `/renovate-classifier`.

If post-update `mergeStateStatus` is `CLEAN`, proceed to §3 and use that check's `headRefOid` for the packet. Do not perform extra `--babysit` polling when the immediate post-update state is already `CLEAN`.

Without `/renovate-loop --babysit`, any post-update state other than `CLEAN` → stop; do not analyze.

With `/renovate-loop --babysit`, handle only post-update settling for the PR head created by the successful branch update. Run the tested helper with the post-update head as the expected head, using default budgets and intervals:

```bash
npm exec -- tsx scripts/renovate-freshness-poll.ts --repo {owner}/{repo} --pr {N} --expected-head {postUpdateHeadRefOid}
```

Do not pass debug override flags from skill prose. The helper owns merge-state polling, CI polling, wall-clock budgets, consecutive `UNKNOWN` handling, head-SHA binding, and terminal outcome classification.

Helper result handling:

| Helper result             | Classifier behavior                                                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outcome: "clean"`        | Proceed to §3 and use returned `headSha` for packet `pr.head_sha`. This is the only packet-eligible SHA and must come from the helper's merge-state observation that returned `CLEAN`.                                                       |
| Any other valid `outcome` | Stop before §3; do not analyze; do not emit a packet. Report the terminal outcome (`unknown_exhausted`, `budget_exhausted`, `merge_query_failed`, `ci_query_failed`, `ci_failed`, `non_clean`, or `head_changed`) plus counters and details. |
| Nonzero helper exit       | Stop before §3; do not analyze; do not emit a packet. Report helper execution failure separately from a controlled freshness or CI stop.                                                                                                     |

When reporting a `--babysit` freshness stop or resolution, include the helper outcome, `freshnessRechecks`, `ciPolls`, `elapsedMs`, and any diagnostic `mergeState`, `ciState`, `observedHeadSha`, or `detail`. No packet may be emitted unless the helper returns `outcome: "clean"`.

### 3. Analyze the selected PR (GitHub MCP or `gh`)

For the **selected PR only**, fetch in parallel where possible:

| Step | MCP (preferred)                              | `gh` fallback                                                          | Purpose                                                                                                           |
| ---- | -------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1    | `pull_request_read` `method: get`            | `gh pr view <N> --json title,body,labels,isDraft,mergeable,headRefOid` | Title, body (release notes), labels, draft state, mergeable, **`head.sha`** for packet `head_sha` (post-update)   |
| 2    | `pull_request_read` `method: get_files`      | `gh pr diff <N> --name-only` + `gh pr view <N> --json files`           | Changed paths, additions/deletions per file; **`pr_file_count`** = total files returned                           |
| 3    | `pull_request_read` `method: get_check_runs` | `gh pr checks <N>`                                                     | CI status — primary source for merge-blocking check from consumer `checks.pr_ci_green`; requires classic `repo` PAT (Checks API) |
| 4    | `pull_request_read` `method: get_diff`       | `gh pr diff <N>`                                                       | Workflow pin verification (`uses_pin_only`, `same_major_only`); lockfile confirmation when file list is ambiguous |

From title/body extract:

- Package name(s) and version bump (`major` / `minor` / `patch`)
- Renovate "Release Notes" / "Compare" sections
- Breaking-change keywords (`BREAKING`, major semver, migration guides)
- Whether the PR is grouped (multiple packages; Renovate group name if present)

### 4. Classify

Apply loaded consumer policy facts with [policy-rubric.base.md](../../../.agents/policy-rubric.base.md) in this order:

1. **Defer** triggers
2. **Review manually** triggers (major semver applies **except** low-risk tooling devDep majors meeting **Low-risk tooling major → agent review**)
3. Else if **at least one major semver bump** and **Low-risk tooling major → agent review** gates pass → human table **review manually**; packet `decision: agent_review_required`, `merge_authority: allowed_if_no_code_changes`, `risk_class: low_risk_tooling_major`
4. Else if **all Safe to merge** gates in policy-rubric.base are satisfied → **merge**
5. Else → **review manually**

Assign **risk** (low / medium / high) per rubric.base. Derive packet fields per [policy-rubric.base.md — Rubric outcome → packet fields](../../../.agents/policy-rubric.base.md#rubric-outcome--packet-fields) and [packet-schema.md](packet-schema.md). Never execute merges.

### 5. Report

#### Queue overview

After discovery reconciliation and target selection, state which PR was analyzed and which remain:

```markdown
## Queue overview

- Selected for this run: #{N}
- Remaining in queue: #{A}, #{B}, … (or "none")
- Re-run `/renovate-classifier` after maintainer to process the next FIFO item.
```

#### Summary table (one row)

| PR | Title | Packages | Risk | CI | Lockfile Δ | Release-note flags | Recommendation |

CI cell values: `green` / `red` / `pending` / `unknown`.

#### Detailed notes (selected PR only)

```markdown
### #{number} — {title}

**Summary:** …
**Risk:** low | medium | high
**CI:** …
**Lockfile:** …
**Release notes:** … (or "none surfaced")
**Recommendation:** merge | review manually | defer
**Rationale:** …
```

#### Execution packet (one per run)

After the detailed notes, emit machine-readable handoff per [packet-schema.md](packet-schema.md).

1. **Batch envelope** — one fenced YAML block with `packet_version`, `repo`, `generated_at`, `discovery` (same counts as discovery reconciliation), `selected_pr`, and `queue_remaining`.
2. **Per-PR packet** — **one** fenced YAML block for the selected PR. Every packet **must** include:
   - `policy_version` from `version` in [`.agents/renovate-policy.yml`](../../../.agents/renovate-policy.yml) at classification time
   - `pr.head_sha` from `get` at classification time (**after** any §2.7 branch update and, when `/renovate-loop --babysit` resolves settling, from the check that returned `CLEAN`)
   - `evidence_checked_at` (ISO8601 when evidence was fetched)
   - `base_freshness` (audit trail from §2.6–§2.7)
   - `classification.decision`, `merge_authority`, `risk_class` per [policy-rubric.base.md](../../../.agents/policy-rubric.base.md)
   - `evidence` including `pr_file_count`, `package_count`, `lockfile_maintenance`, `lockfile_delta` (with `line_delta_limit`, `within_threshold`, `threshold_flags`), and `workflow_changes` when workflows touched
   - `required_checks` assembled per [check assembly rules](packet-schema.md#required_checks-assembly-classifier)
   - `human_required_if` (full watch list) and `triggered_human_required` (conditions already fired)
   - `stop` / `stop_reason` when `triggered_human_required` is non-empty or `decision` is `human_required` / `defer`
   - `stop_causes` when `stop: true` — derive with [`scripts/lib/derive-stop-causes.ts`](../../../scripts/lib/derive-stop-causes.ts); required on every stopped packet

Do **not** merge, approve, comment, or close PRs while emitting the packet.

#### Handoff

After the packet, emit **one** copy/paste block for manual execution (skip when recommendation is `defer`).

**Route by packet shape** — run [`evaluateInvestigationEligibility`](../../../scripts/lib/renovate-investigation-eligibility.ts) against live [`.agents/renovate-policy.yml`](../../../.agents/renovate-policy.yml) when `stop: true`. **Mandatory** — do not use heuristic substitutes; `eligible: true` → investigator handoff, `eligible: false` → hard stop.

| Packet shape                                                     | Handoff target                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `stop: false` (`auto_merge_eligible` or `agent_review_required`) | **Maintainer** — auto merge path                                           |
| `stop: true` and investigation-eligible                          | **Investigator** — investigation lane (no maintainer without `--approved`) |
| `stop: true` and not investigation-eligible                      | **None** — hard stop; operator handles on GitHub or re-runs classify later |

**Maintainer handoff** (`stop: false`):

```markdown
Execute the renovate maintainer agent for PR #{N} using the packet above.
Merge only if merge_authority conditions are satisfied.
Stop and report if policy_version differs from renovate-policy.yml at preflight or immediately before merge, if head_sha differs from the live PR at preflight or immediately before merge, if mergeStateStatus is BEHIND at maintainer preflight, if any triggered_human_required condition is present, or if any human_required_if condition becomes true during inspection.
Re-run `/renovate-classifier` after maintainer to classify the next FIFO item.
```

Reference `@.agents/renovate-maintainer.md` and the full copy/paste prompt in [`.agents/renovate-maintainer.md`](../../../.agents/renovate-maintainer.md).

**Investigation handoff** (`stop: true`, investigation-eligible):

```markdown
Investigate PR #{N} using the classifier packet above.
Follow renovate-investigator SKILL.md and write the investigation report to .agent-runs/renovate/{date}-pr-{N}-investigation.md.
When verdict is ready_for_human_merge, emit the production-executable declarative execution overlay YAML in chat.
Do not merge. Do not invoke maintainer or --approved from this step.
After you audit the investigation report, open a fresh chat with /renovate-maintainer --approved plus packet and overlay.
```

Reference `@.agents/renovate-investigator.md` and the full copy/paste prompt in [`.agents/renovate-investigator.md`](../../../.agents/renovate-investigator.md).

**Hard stop** (`stop: true`, not investigation-eligible): state that the packet is not maintainer- or investigation-handoff eligible; include `stop_causes` in the summary; operator reviews on GitHub or defers.

## Failure modes

| Condition                                           | Behavior                                                                                                                                                                                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub MCP and `gh` both unavailable (step 0)       | Stop. No classification. Prompt user to connect MCP or authenticate `gh`.                                                                                                                                                                                                          |
| `get_check_runs` 403 (fine-grained PAT)             | Attempt `gh pr checks <N>` for the selected PR. If `gh` succeeds, use that result. If `gh` also fails or is unavailable, report CI as `unknown`; tell user Checks API requires classic `repo` PAT in `~/.cursor/mcp.json` or authenticated `gh` with repo access; do not guess CI. |
| Zero active (non-draft) Renovate PRs                | Report empty active queue (drafts-only counts as empty); do not invent reviews; no packet.                                                                                                                                                                                         |
| Explicit PR not in active Renovate set              | Stop with queue summary; no packet. Includes draft Renovate targets.                                                                                                                                                                                                               |
| Pre-update `mergeStateStatus` `UNKNOWN` (§2.6)      | Stop before §3; emit **What to do next** operator block; no packet. `/renovate-loop --babysit` does not poll — only §2.7 post-update settling may use `renovate-freshness-poll.ts`.                                                                                                |
| `mergeStateStatus` BLOCKED / DIRTY (§2.6)           | Stop before §3; report merge state; no packet unless the freshness gate reaches `CLEAN`.                                                                                                                                                                                           |
| `gh pr update-branch` fails (§2.7)                  | Stop; report error (conflicts, permissions); no packet.                                                                                                                                                                                                                            |
| `--babysit` helper returns non-clean outcome (§2.7) | Stop; report the helper terminal outcome and diagnostics; no packet.                                                                                                                                                                                                               |
| Readonly MCP only + BEHIND                          | Stop at §2.7; instruct `gh` auth with write or manual branch update.                                                                                                                                                                                                               |
| MCP call fails mid-run                              | Report what completed; state failure reason. Do not guess missing data.                                                                                                                                                                                                            |
| Ambiguous classification                            | Default to **review manually**; explain ambiguity in rationale.                                                                                                                                                                                                                    |

## References

- Classification policy: [policy-rubric.base.md](../../../.agents/policy-rubric.base.md) (load consumer `.agents/renovate-policy.yml` first)
- Execution packet schema: [packet-schema.md](packet-schema.md)
- Renovate config: `renovate.json`
- CI workflow: `.github/workflows/ci.yml`
