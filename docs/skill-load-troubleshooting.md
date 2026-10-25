# Skill body load troubleshooting (Agent Plugins 1.0)

Use this when slash commands / plugin catalog **discovery** works but the host **Skill tool** fails to load `SKILL.md` (empty body, GitHub Contents **404** on `.cursor/skills/…`, or fallback to repo docs only).

## Confirmed mechanism

| Layer | Expected on `main` | Stale registration |
| --- | --- | --- |
| Canonical tree | `skills/<name>/SKILL.md` | Same on disk |
| `.cursor-plugin/plugin.json` | `"skills": "./skills"` | Same in git |
| Discovery / catalog | Skill listed; metadata may show `skillRelativePath: skills/…` | Often still correct |
| Body fetch (Contents API or Skill tool) | `skills/<name>/SKILL.md` | **`.cursor/skills/<name>/SKILL.md`** → **404** |

The **git checkout is correct**; **installed-plugin capability metadata** (`declaredCapabilityPaths.skill`) can remain on the pre–0.2.0 path from when `.cursor-plugin/plugin.json` used `"skills": ".cursor/skills"`.

**Not proven:** adding `"skills"` / `"agents"` on the marketplace plugin entry causes the host to regenerate those paths. Cursor’s [Plugins reference](https://cursor.com/docs/reference/plugins) allows those fields on marketplace entries (they merge with per-plugin manifest), but treat that as a **second experiment** only if the steps below fail.

## Step 0 — Verify the split

Inspect (Cloud Agents often use):

`~/.cursor/plugins/cache/.cloud-plugin-manifest.json`

For `renovate-workflow`, **`declaredCapabilityPaths.skill`** must list `skills/renovate-*/SKILL.md`, not `.cursor/skills/…`.

Confirm the content cache matches `main`:

`~/.cursor/plugins/cache/multipliers-dev-renovate-workflow/<pluginId>/<sha>/.cursor-plugin/plugin.json` → `"skills": "./skills"`, and `skills/renovate-loop/SKILL.md` exists (no `.cursor/skills/` tree).

## Step 1 — Experiment (try this first, no repo change)

**Full marketplace removal and re-add** on current `main`:

1. **Customize → Plugins** — remove the imported **renovate-workflow** marketplace (not only disable the plugin).
2. Quit and restart Cursor (or reload the Cloud Agent environment).
3. Optionally delete: `~/.cursor/plugins/cache/multipliers-dev-renovate-workflow/`
4. Re-import: `/add-plugin https://github.com/multipliers-dev/renovate-workflow` then install the plugin from the catalog.
5. Re-read `declaredCapabilityPaths.skill` — **success criterion:** paths under `skills/…` only.
6. **Skill tool (required):** load `renovate-loop` body; confirm non-empty markdown and that `verification.md` resolves via relative link.

If step 1 fixes paths and body load, **no repository layout or marketplace manifest change is required.**

## Step 2 — If step 1 fails

1. File a **host bug** (capability index not refreshed on plugin upgrade) with manifest before/after excerpts.
2. Only then evaluate whether marketplace-level `"skills": "./skills"` (supported in Cursor marketplace plugin entries) changes registration — **validate on a fork or test branch**, not as speculation on `main`.

## Do not use as a fix

- Duplicating skills under `.cursor/skills/` in this repository.
- Moving canonical skills back under `.cursor/skills/`.

## Repository contract (unchanged)

- Agent Plugins 1.0: root `plugin.json` (metadata only); skills at fixed `skills/`.
- Cursor overlay: `.cursor-plugin/plugin.json` declares `"skills": "./skills"`.
