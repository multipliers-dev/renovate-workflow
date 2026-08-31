# Loop-renovate verification checklist

Manual orchestration checks for **renovate-loop**, plus automated tests for the `renovate-freshness-poll` helper that owns babysit polling behavior.

See [verification.md](verification.md) in this skill directory for the full gate list.

## Prerequisites

- GitHub MCP or authenticated `gh` (classifier + maintainer)
- Classic `repo` PAT for Checks API (see [docs/renovate-workflow.md](../../../docs/renovate-workflow.md))
- Open Renovate PRs in the repo (for happy-path tests)
- Local git remote points at the active repository

## Invocation

```
@.cursor/skills/renovate-loop/SKILL.md

/renovate-loop dry-run
```

For full loop (includes maintainer merges when eligible):

```
@.cursor/skills/renovate-loop/SKILL.md

/renovate-loop
```

For full loop with bounded merge-state babysitting:

```
@.cursor/skills/renovate-loop/SKILL.md

/renovate-loop --babysit
```

## 1. Loop invariant

- [ ] Iteration 1 starts with clean worktree check (`git status --porcelain` empty); stops with `dirty_worktree` when not
- [ ] Iteration 1 continues with `git fetch origin` + local `main` reset to `origin/main` only when clean
- [ ] Iteration 2+ repeats main sync before classify (not skipped after a merge)
- [ ] Loop summary records `main_sha_after_sync` per iteration
- [ ] Prior iteration packet is not passed into the next iteration

## 2. Dry-run

With 2+ open Renovate PRs:

- [ ] Exactly **one** classify iteration runs; maintainer and investigator are **not** invoked; no iteration 2
- [ ] FIFO queue overview matches `/renovate-classifier` alone
- [ ] Loop ends with `dry_run_complete` (auto path), `investigation_complete` (investigation lane), or a classifier hard-stop tag (e.g. `queue_empty`, `classifier_freshness_stop`, `classifier_stop`) — not `iteration_fuse`
- [ ] No `gh pr merge` from orchestrator session

### 2.4. Draft skip (discovery / dry-run)

With at least one draft Renovate PR present:

- [ ] Discovery reconciliation lists the draft under **Draft Renovate PRs skipped** (count + numbers)
- [ ] FIFO / active queue overview **omits** the draft; selected head is the next non-draft (or stop with `queue_empty` if none)
- [ ] Packet `discovery.open_renovate_prs` is active-only; `skipped_draft` / `draft_renovate_prs` reflect the draft
- [ ] When **only** draft Renovate PRs remain, dry-run / classify outcome is `queue_empty` (no packet; no maintainer or investigator)
- [ ] Loop does **not** attempt maintainer or investigator on a draft PR

### 2.5. Investigation lane dry-run

When FIFO head is investigation-eligible (`high_touch_tooling` or `unlisted_package`, `stop: true`, overridable `stop_causes` only, e.g. vitest #402 or unlisted tsx #425 shape):

- [ ] Routing tag is `investigation_complete` (not `classifier_stop`)
- [ ] Chat summary notes investigator would run; maintainer would **not**
- [ ] Investigator is **not** invoked in dry-run

## 3. Happy path — auto merge path (when 2+ mergeable `stop: false` PRs exist)

When FIFO heads are on the maintainer auto path (`stop: false`), not the investigation lane:

- [ ] Iteration 1: maintainer merges PR₁ (when policy allows)
- [ ] Iteration 2: main synced; classifies a **different** FIFO PR with new `head_sha`
- [ ] Loop summary references PR₁ then PR₂ (or `queue_empty`), never PR₁'s stale `head_sha` in iteration 2

## 3.5. Investigation lane (normal loop, not dry-run)

When FIFO head is investigation-eligible (`high_touch_tooling` or `unlisted_package`, `stop: true`, overridable `stop_causes` only):

- [ ] Loop delegates to investigator (not maintainer) and **stops** after investigation completes
- [ ] Loop summary shows `delegate: investigator` and stop tag `investigation_complete` (or investigator verdict in outcome)
- [ ] Loop does **not** continue to iteration 2 or invoke `/renovate-maintainer --approved` — human gate is a separate fresh chat

## 4. Classifier hard stop (no delegate)

When FIFO PR is `BLOCKED` / freshness stop:

- [ ] Loop stops at classifier with tag `classifier_freshness_stop` (or related pre-delegation tag)
- [ ] Maintainer and investigator are **not** invoked

When packet is `stop: true` and **not** investigation-eligible:

- [ ] Loop stops with tag `classifier_stop` or `defer`
- [ ] Maintainer and investigator are **not** invoked

## 4.5. Babysit modifier

- [ ] Already `CLEAN` before update: `/renovate-loop --babysit` performs no branch update and no polling
- [ ] `BEHIND` → update → immediately `CLEAN`: branch update occurs, no additional polling occurs, and the packet uses the immediate post-update check's `headRefOid`
- [ ] Pre-update §2.6 `UNKNOWN`: loop stops with `classifier_freshness_stop`; babysit cell is `enabled_not_triggered`; helper is **not** invoked
- [ ] Loop output explicitly states: **babysit not triggered because the freshness gate stopped before branch update** (or equivalent normative wording from loop skill)
- [ ] Operator output includes **What to do next** steps and distinguishes pre-update `UNKNOWN` from `BLOCKED`/`DIRTY` (no operator-facing `baseRefOid` comparison)
- [ ] Post-update `UNKNOWN` or `BLOCKED`: classifier invokes `npm exec -- tsx scripts/renovate-freshness-poll.ts --repo ... --pr ... --expected-head ...` only when `/renovate-loop --babysit` is active
- [ ] Helper `outcome: "clean"`: loop routes per packet shape after classifier emits a packet using the returned `headSha` — maintainer auto path when `stop: false`, investigator when investigation-eligible (F1)
- [ ] Helper stop outcome (`unknown_exhausted`, `budget_exhausted`, `merge_query_failed`, `ci_query_failed`, `ci_failed`, `non_clean`, or `head_changed`): loop stops with `classifier_freshness_stop` and does **not** invoke maintainer or investigator
- [ ] Default `/renovate-loop` still stops immediately on post-update `UNKNOWN`
- [ ] `/renovate-loop dry-run` remains one classify-only iteration and performs no babysit rechecks
- [ ] Loop summary records the helper outcome, freshness recheck count, CI poll count, elapsed time, and any diagnostic fields

## 5. Maintainer stop

When maintainer cannot complete merge:

- [ ] Loop stops with explicit maintainer stop tag and PR number
- [ ] No second merge attempted in the same `/renovate-loop` run

## 6. Stale-packet safety

Simulate or observe `stale_packet` / `base_behind` maintainer stop:

- [ ] Loop stops; operator must re-run `/renovate-loop` fresh
- [ ] Orchestrator does not retry with the same packet

## 7. Iteration fuse

- [ ] Fuse caps at 10 iterations; iteration 11 does not start
- [ ] Stop tag `iteration_fuse` reported

## 8. Authority audit

- [ ] Classifier never merges during loop
- [ ] Investigator never merges or passes `--approved` during loop
- [ ] Maintainer never selects queue (only consumes current packet)
- [ ] Orchestrator never merges, approves, or comments
- [ ] Orchestrator never passes `--approved`
- [ ] Orchestrator does not run post-merge CI (maintainer report is source of truth)

## 9. Script tests

- [ ] `npm run test:scripts -- scripts/renovate-freshness-poll.test.ts scripts/renovate-guardrails.test.ts scripts/renovate-investigation-eligibility.test.ts` passes

## Allowed gitignored outputs

- `.agent-runs/renovate/loop-{YYYY-MM-DD}.md`
- `.agent-runs/renovate/{YYYY-MM-DD}-pr-{N}.md` (maintainer)
