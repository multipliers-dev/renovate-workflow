# Legacy `.cursor/skills/` compatibility shim

## Why this exists

Agent Plugins **1.0** fixed canonical skill discovery at repository-root [`skills/`](../skills/). Version **0.2.0** moved the five `renovate-*` skills out of `.cursor/skills/` to match that spec (see [adopt.md — upgrading from 0.1.0 → 0.2.0](adopt.md#upgrading-from-010--020)).

Plugin **discovery** in Cursor/Grok Bot resolves the correct tree (`skillRelativePath: skills/…` in the installed-plugin cache). Some hosts still **load skill bodies** via the GitHub Contents API at the pre-0.2.0 path:

`.cursor/skills/<skill-name>/SKILL.md`

That path returns **404** on branches that only ship `skills/`, which breaks the Skill tool even when slash-command discovery succeeds. The Monday Renovate ladder then falls back to repo docs instead of skill bodies; per-PR report files may be skipped for that run.

## What we ship

| Layer | Path | Role |
| --- | --- | --- |
| **Canonical (edit here)** | `skills/` | Agent Plugins 1.0 source of truth; `.cursor-plugin/plugin.json` `"skills": "./skills"` |
| **Generated compat copies** | `.cursor/skills/` | Byte-identical mirrors for legacy body fetch only — **do not edit by hand** |

Generation is deterministic: `npm run sync:legacy-skill-shim`.

CI fails when canonical and legacy trees diverge (`scripts/legacy-skill-shim.test.ts` and `validate-plugin-structure`).

The npm tarball still ships **`dist/` + README only** — plugin skills are git/marketplace, not npm.

## Maintainer workflow

1. Change skill content under `skills/` only.
2. Run `npm run sync:legacy-skill-shim`.
3. Commit both trees in the same PR.

Check without writing: `npm run sync:legacy-skill-shim -- --check`.

## Verification after merge

1. On the merged default branch, GitHub Contents must return **200** for each  
   `.cursor/skills/renovate-*/SKILL.md` (REST or web UI).
2. Reinstall or reload the **renovate-workflow** plugin on the affected host (e.g. Grok Bot).
3. Load each skill body via the host **Skill** tool (not discovery alone).
4. Run one Monday ladder slice (or `/renovate-classifier`) and confirm skill bodies load and per-PR artifacts behave as before.

Cloud agents in this repo **cannot** fully reproduce host-side Skill loading; green CI plus Contents API checks on the branch are necessary but not sufficient.

## Rollback

Revert the PR that introduced or refreshed the shim. Canonical `skills/` remains correct for Agent Plugins 1.0; hosts that already use `skills/` for body load are unaffected. Hosts that only read `.cursor/skills/` will regress to 404 again.

## When to remove the shim

Remove `.cursor/skills/` generated copies when **all** supported install targets load skill bodies from the discovered path (`skills/…`) and no longer request `.cursor/skills/…` via GitHub Contents. Confirm with:

- Grok Bot / Cursor Skill tool body load on a clean plugin install
- No 404s in host logs for `.cursor/skills/renovate-*`

Then delete the shim script, tests, generated tree, and this document in one focused change. Do **not** move canonical skills back under `.cursor/skills/`.

## Monday ladder fallback

If skill bodies still fail to load after shim deploy, the ladder may continue using runbook/docs fallbacks documented in [renovate-workflow.md](renovate-workflow.md). Fixing body load restores full skill-guided behavior; it does not change merge-ladder policy semantics.
