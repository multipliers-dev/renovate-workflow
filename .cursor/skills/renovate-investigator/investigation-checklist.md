# Renovate investigation checklist

Four-step evidence loop for investigation-eligible dependency upgrades (`high_touch_tooling` or `unlisted_package`). See [investigation-rubric.md](investigation-rubric.md) for verdict criteria.

The investigator reframes each step as a question the packet must answer — not a migration plan.

## Step 1 — Inspect the upstream change

**Question:** What did the upstream release change, and which failure modes are plausible?

**Gather:**

- Release notes, changelog, compare links from the Renovate PR body
- Semver bump class (`major` / `minor` / `patch`) per package
- Documented breaking changes, deprecations, migration guides
- CI signal from the packet (`evidence.ci`) — green is necessary but not sufficient

**Output in report:** Named upstream surfaces that _could_ affect this repo (APIs, config keys, CLI behavior, bundler pipeline, test runner semantics). Do not assume every documented break applies.

## Step 2 — Map changes to actual usage

**Question:** Does this repository use the surfaces those changes break?

**Gather:**

- Import/require analysis for bumped package(s)
- Config file references (`vite.config`, `vitest.config`, `tsconfig`, etc.)
- Grep for APIs, plugins, or CLI flags named in release notes
- Compare packet `evidence.changed_files` — manifest/lockfile-only vs source edits on the PR branch

**Output in report:** For each named upstream risk, **used / not used / unknown** with file evidence. Reframe from "does the package have breaking changes?" to "does this app touch the surfaces those changes break?"

## Step 3 — Identify custom risk

**Question:** What project-specific behavior could still break even when generic migration work is unnecessary?

**Gather:**

- Custom plugins, hooks, or middleware wrapping the dependency
- Non-standard build/test configuration
- Sensitive paths from policy (`renovate-policy.yml` `repo.sensitive_paths`) when relevant
- Packet `triggered_human_required` and `human_required_if` watch conditions — explain which fired and why

**Output in report:** Custom risk items with **resolved / unresolved** status. Unresolved custom risk blocks `ready_for_human_merge`.

## Step 4 — Validate the app

**Question:** Does runtime or integration evidence show the custom-risk paths still work?

**Gather:**

- PR CI results (re-fetch if stale vs packet `pr.head_sha`)
- Production or preview deploy when custom risk touches build output or HTML ordering
- Targeted test runs when the bumped package is a test runner or build tool exercised by CI
- Lockfile threshold re-check when `lockfile_within_threshold` is on the packet

**Output in report:** Validation evidence with links (CI run, preview URL, local command output). CI green alone does not close step 4 when step 3 flagged unresolved custom risk.

## Verdict coupling

| All four steps             | Custom risk    | Typical verdict                                                              |
| -------------------------- | -------------- | ---------------------------------------------------------------------------- |
| Sufficient evidence        | All resolved   | `ready_for_human_merge` (when changed files ⊆ investigation `allowed_paths`) |
| Sufficient evidence        | Any unresolved | `custom_risk_unresolved`                                                     |
| Migration clearly required | —              | `needs_migration`                                                            |
| Evidence gaps remain       | —              | `inconclusive`                                                               |

Only `ready_for_human_merge` produces the declarative execution overlay for `/renovate-maintainer --approved` (see [renovate-maintainer SKILL.md](../renovate-maintainer/SKILL.md)).
