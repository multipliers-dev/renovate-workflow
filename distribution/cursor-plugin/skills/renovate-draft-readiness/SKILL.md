---
name: renovate-draft-readiness
description: >-
  Assesses one open draft Renovate PR per run (FIFO draft queue or explicit
  draft PR number); writes a gitignored readiness report and always upserts a
  managed GitHub readiness comment. Use for parked draft triage, draft
  readiness refresh, or /renovate-draft-readiness.
disable-model-invocation: true
---

# Renovate draft readiness

Keep **parked draft Renovate PRs** visible by refreshing a readiness assessment on the PR. Orthogonal to the merge ladder: does **not** feed maintainer/investigator, does **not** change active-queue semantics, and never unparks.

**One path only:** discover draft queue → select one draft → assess → chat + gitignored report → **upsert managed comment**. No dry-run / `chat only` / `apply` modes — comment publication is the skill.

Supporting docs: [readiness-rubric.md](readiness-rubric.md), [comment-template.md](comment-template.md), [verification.md](verification.md).

Operator runbook: [docs/renovate-workflow.md](../../../docs/renovate-workflow.md) (Parked drafts → Draft readiness). Active classify/loop draft-skip remains in [renovate-classifier](../renovate-classifier/SKILL.md) / [renovate-loop](../renovate-loop/SKILL.md).

## Governance

**Tier:** Tier 2 — external reversible GitHub comment (managed issue comment upsert)

**State changed:**

- One managed PR issue comment identified by HTML marker `<!-- renovate-draft-readiness -->` (create or update that comment only)
- `.agent-runs/renovate/{YYYY-MM-DD}-pr-{N}-draft-readiness.md` (gitignored; never committed)
- Forbidden: merge; approve; `gh pr ready` / mark ready for review; close; `gh pr update-branch` / rebase; labels (unless a later plan scopes them); classifier execution packets; feeding maintainer/investigator

**Default behavior:**

- observe → analyze → **evidence gate** → report (chat + gitignored file) → **upsert managed comment** on every successful run
- No dry-run / `chat only` / `apply` modes (deliberate Tier 2 exception: publication is the skill purpose)

**Mutation command:**

- Normal invocation — write success report only after §4 evidence gate; upsert managed comment only after §6 pre-publish `head_sha` recheck also passes
- There is no separate apply gate; missing `gh` write fails at §0 preflight

**Evidence gate (before report write) + pre-publish recheck (immediately before comment write):**

1. Re-fetch the selected PR
2. Require: `state` open, `isDraft` true, Renovate identity (classifier §2 rules)
3. Bind assessment to current `head_sha` — if SHA changed since assessment started, re-analyze on the new SHA then re-run this gate, or **block** (do not write a success report or publish a stale body)
4. State intended comment action (`create` vs `update` + comment id) in chat before mutate
5. **Immediately before** create/PATCH: re-fetch live `head_sha` (and open/draft/Renovate); must still match the bound SHA — otherwise re-analyze + re-gate, or block (do not publish)

**Evidence invalidation:**

- PR closed, no longer draft, or no longer Renovate-identity → **hard stop**; no success report; no comment write (optional short gate-failure report only — see §4)
- `head_sha` drift mid-run (including after §5 report, before §6 publish) → re-analyze bound to new SHA and re-gate, or block; never write/publish unbound evidence
- Incomplete evidence (gates still pass) → verdict `needs_human`; still write report and upsert comment stating gaps (visibility is the purpose)

**Override:**

- None for draft state, merge, branch update, or ready-for-review

**Audit trail:**

- Chat summary with verdict, `head_sha`, comment action (`created` / `updated` + URL or id)
- Gitignored report under `.agent-runs/renovate/`

**Verification:**

- See [verification.md](verification.md)

**Rollback:**

- Edit or delete the managed comment manually on GitHub; draft state unchanged

## Task

Process **one** draft Renovate PR per invocation:

1. Discover open Renovate PRs (classifier §2 identity) and build the **draft-only** queue
2. Select FIFO lowest draft number, or explicit `#` **in the draft Renovate set**
3. Assess readiness per [readiness-rubric.md](readiness-rubric.md)
4. Re-fetch evidence gate (open + draft + Renovate + `head_sha` bind) — **before** any success report
5. Write gitignored report from [`.agents/templates/renovate-draft-readiness-report.md`](../../agents/templates/renovate-draft-readiness-report.md)
6. Upsert the managed comment per [comment-template.md](comment-template.md)

## Steps

### 0. Preflight (`gh` write required; MCP optional for reads)

Managed comment upsert is the skill purpose and uses `gh api` only. **Authenticated `gh` with repo write is mandatory at preflight** — do not start assessment on MCP-only or read-only `gh`.

1. Confirm `gh auth status` succeeds and the token can write to `{owner}/{repo}` (comment create/PATCH). Prefer a quick probe once `owner`/`repo` are known in §1, e.g. `gh api user` plus readiness to call the issues comments API; if write is clearly unavailable, **hard stop** here.
2. GitHub MCP is **optional** for reads when connected. When MCP is connected: read tool schemas before calling. Useful reads: `list_pull_requests`, `pull_request_read` (`get`, `get_files`, `get_check_runs`, `get_comments`), `search_pull_requests`.
3. **If `gh` is unavailable or lacks repo write:** hard stop — instruct the operator to run `gh auth login` (or refresh credentials) with repo write. Do **not** assess, write a success report, or invent comments. MCP-only is insufficient.
4. **Forbidden write tools / commands:** `merge_pull_request`, `pull_request_review_write`, `update_pull_request` (except managed comment via REST below), `gh pr merge`, `gh pr review`, `gh pr close`, `gh pr ready`, `gh pr update-branch`, rebase of Renovate branches, label mutations.

**Allowed write (comment upsert only):**

```bash
# Create
gh api repos/{owner}/{repo}/issues/{N}/comments -f body="$(cat <<'EOF'
…comment body with marker…
EOF
)"

# Update existing managed comment
gh api --method PATCH repos/{owner}/{repo}/issues/comments/{COMMENT_ID} -f body="$(cat <<'EOF'
…comment body with marker…
EOF
)"
```

Prefer HEREDOC for body so markdown and the HTML marker are preserved.

### 1. Resolve repository

From the active workspace git remote, resolve `owner` and `repo`.

### 2. Discover draft Renovate queue

Use the **same Renovate identity and pagination rules** as [renovate-classifier SKILL.md §2](../renovate-classifier/SKILL.md). Do **not** stop after one API page — silent omissions are a hard failure of this step.

This repo runs **self-hosted Renovate** via GitHub Actions (`.github/workflows/renovate.yml`) using a PAT. Those PRs use the `renovate/` branch prefix but are **authored by the PAT owner**, not `app/renovate`. Prefer **head-branch** detection; use **author search** only for hosted Renovate / GitHub App setups.

**Primary — head branch (`head-branch`):**

MCP:

```text
list_pull_requests
  owner, repo, state: open, perPage: 100, page: 1
```

Read draft/`isDraft` from each list item. When the list payload lacks draft state, follow up with `gh pr view <N> --json isDraft` or `pull_request_read` for candidate Renovate PRs before building the draft queue.

**`gh` fallback:** `gh pr list --repo {owner}/{repo} --state open --json number,title,headRefName,isDraft --limit 100` (paginate with `--search` or increase limit as needed). Filter where `headRefName` starts with `renovate/`.

**Paginate (required):** repeat with `page: 2`, `page: 3`, … while a page returns 100 PRs (full page). **Merge all pages before filtering.** (`renovate.json` sets `prConcurrentLimit: 5`, so >100 open PRs is unlikely here, but pagination avoids silent omissions.)

From the combined result, select open PRs whose `head.ref` starts with `renovate/` (matches `branchPrefix` in `renovate.json`). Count all other open PRs as non-Renovate skipped.

**Fallback — author search (`author-search`)** only if **zero** open PRs have `head.ref` starting with `renovate/` after filtering the list — even when `list_pull_requests` returned other open PRs (e.g. feature branches):

MCP:

```text
search_pull_requests
  query: "repo:{owner}/{repo} is:pr is:open author:app/renovate"
  perPage: 100
```

**`gh` fallback:** `gh search prs --repo {owner}/{repo} --state open --author app/renovate --json number,title,headRefName,isDraft --limit 100`

When `isDraft` is missing from search results, resolve it per PR via `gh pr view <N> --json isDraft` or `pull_request_read` before building the draft queue. Paginate author-search the same way when a page is full (100 results): continue until a short page, then merge.

Use author-search for Mend-hosted Renovate or the Renovate GitHub App. Accept PRs from this search even if the head branch does not start with `renovate/` (unusual but valid for some hosted configs).

**Skip / queue rules:**

- On **head-branch** path: skip open PRs whose head branch does not start with `renovate/`.
- On **author-search** path: skip PRs not returned by the search (already filtered to `app/renovate`).
- Never treat a non-Renovate open PR as Renovate.
- After the Renovate identity filter: **draft queue** = open Renovate PRs that **are** draft (`isDraft: true`). Active (non-draft) Renovate PRs are reported for reconciliation but are **not** selectable here.

Emit discovery reconciliation:

```markdown
## Discovery reconciliation

- Repo: {owner}/{repo}
- Method: head-branch | author-search
- Draft Renovate PRs (queue): N (#436, …)
- Active (non-draft) Renovate PRs (not selectable here): N (#123, …)
- Non-Renovate open PRs skipped: N
- Note: Draft FIFO for readiness lives in this skill; active classify/loop queue is unchanged.
```

If zero draft Renovate PRs → report and stop (no comment, no report file required).

### 2.5. Select target PR

| Input                                                                          | Selection rule                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------- |
| User prompt includes explicit PR number (e.g. `/renovate-draft-readiness 436`) | That PR **must** be in the **draft** Renovate set |
| No explicit number                                                             | **FIFO** — lowest draft Renovate PR number        |

**Explicit non-draft** (open Renovate but not draft, or non-Renovate) → **stop**; tell the operator to use `/renovate-classifier` for the active queue. Do not assess or comment.

### 3. Assess readiness

For the selected draft only, gather evidence dimensions in [readiness-rubric.md](readiness-rubric.md):

1. Ecosystem blockers
2. Incomplete Renovate diff
3. CI state (current head)
4. Branch freshness vs `main` — **report only; do not update the branch**
5. Policy classification preview (advisory) per [readiness-rubric.md](readiness-rubric.md) §5 — package-list / `risk_class` labels only; never classifier merge/review/defer recommendations

Assign verdict: `remain_draft` | `ready_to_unpark` | `needs_human`.

Record `head_sha` at assessment start. Prefer `gh pr view <N> --json …` or MCP `pull_request_read` `get` / `get_files` / `get_check_runs` / `get_status`.

Keep assessment working notes in chat/memory only until §4 passes — **do not** write the success report yet.

### 4. Evidence gate (re-fetch before report)

**Required before §5 and §6.** Re-fetch the selected PR and enforce:

1. `state` open, `isDraft` true, Renovate identity still holds
2. Live `head_sha` equals the assessment-bound SHA
3. Intended comment action known (`create` vs `update` + comment id from comment list)

| Gate outcome                                                        | Next step                                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Pass                                                                | Proceed to §5 (report) then §6 (comment)                                                     |
| `head_sha` drift                                                    | Re-run §3 on the new SHA, then re-run §4; do not keep the unbound verdict                    |
| Closed / not draft / not Renovate / operator chooses block on drift | **Hard stop** — no §5 success report; no §6 comment; optional gate-failure note only (below) |

**Gate-failure note (optional):** if useful for audit, write `.agent-runs/renovate/{YYYY-MM-DD}-pr-{N}-draft-readiness.md` with verdict `gate_failed` (or equivalent), the gate reason, and `Managed comment: action: none`. **Forbidden:** leaving a success-shaped report whose verdict/`head_sha` was never gate-bound or published.

### 5. Write gitignored report

Only after §4 **passes** (bound `head_sha` matches live head).

Fill [`.agents/templates/renovate-draft-readiness-report.md`](../../agents/templates/renovate-draft-readiness-report.md).

Path: `.agent-runs/renovate/{YYYY-MM-DD}-pr-{N}-draft-readiness.md` (local date `Australia/Sydney` unless the operator specifies otherwise).

Never commit this file. If §6 later fails after this write, update the report’s **Managed comment** section to `action: none` + failure reason before ending — do not leave `created`/`updated` implied.

### 6. Upsert managed comment

Only after §4 **passes** and §5 has written the bound report (or update the report immediately after a successful upsert with final `comment_id`).

1. List issue comments: `gh api repos/{owner}/{repo}/issues/{N}/comments --paginate` or MCP `pull_request_read` `get_comments` (may reuse §4 list if still fresh).
2. Find the comment whose body contains exact marker `<!-- renovate-draft-readiness -->`.
3. Build body from [comment-template.md](comment-template.md):
   - **Create (no marker found):** first-body shape (`## Why this PR is draft / not ready to merge` or ready variant)
   - **Update (marker found):** rewrite entire managed body with `## Update (YYYY-MM-DD)` plus evidence sections (do not append a second unmanaged comment)
4. Include the marker on its own line (typically at end of body).
5. **Pre-publish recheck (required):** immediately before create/PATCH, re-fetch the PR (`gh pr view <N> --json headRefOid,isDraft,state` or MCP `get`). Require still open + draft + Renovate identity, and live `head_sha` **equals** the §4/§5 bound SHA.
   - Drift / left draft / closed → **do not publish**. Treat as §4 failure after report: update the report to `gate_failed` (or Managed comment `action: none` + reason), then re-run §3→§4 on the new SHA **or** hard stop. Never PATCH/create a body bound to a superseded commit.
6. Create or PATCH via `gh api` as in §0 only after step 5 passes.
7. Confirm in chat: comment id, URL if available, `created` | `updated`, bound `head_sha`, verdict.

Do **not** edit historical human comments that lack the marker (e.g. prior #436 notes). The managed comment is a separate, single identity.

### 7. Chat summary

Post:

- Discovery reconciliation
- Selected PR + remaining draft queue
- Verdict + one-line rationale (only the gate-bound verdict; say `gate_failed` on hard stop)
- Branch freshness (`BEHIND` / `CLEAN` / …) — no update performed
- Report path (or “no success report” on gate failure)
- Comment action (`created` / `updated` / `none`)

## Failure modes

| Condition                                 | Behavior                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `gh` unavailable or lacks repo write (§0) | Hard stop at preflight; no assessment; no success report; no comment                        |
| Zero draft Renovate PRs                   | Empty draft queue in chat; stop; no success report                                          |
| Explicit PR not in draft Renovate set     | Stop; if non-draft Renovate, point operator to `/renovate-classifier`                       |
| Evidence gate fails (§4)                  | Hard stop; no success report; no comment; optional `gate_failed` note only                  |
| Pre-publish `head_sha` drift (§6 step 5)  | Do not publish; update report; re-analyze + re-gate or hard stop — never publish stale body |
| `head_sha` drift mid-run (before §5)      | Re-analyze + re-gate, or block per §4; never write/publish unbound success verdict          |
| Ambiguous blockers (gates pass)           | Verdict `needs_human`; write report and upsert comment stating gaps                         |

## References

- Readiness rubric: [readiness-rubric.md](readiness-rubric.md)
- Comment template: [comment-template.md](comment-template.md)
- Verification: [verification.md](verification.md)
- Classifier identity / active queue: [renovate-classifier/SKILL.md](../renovate-classifier/SKILL.md)
- Policy preview scope: [readiness-rubric.md](readiness-rubric.md) §5 (consumer `.agents/renovate-policy.yml` + [policy-rubric.base.md](../../agents/policy-rubric.base.md); no merge recommendations)
- Policy file: [`.agents/renovate-policy.yml`](../../../.agents/renovate-policy.yml)
- Runbook: [docs/renovate-workflow.md](../../../docs/renovate-workflow.md)
