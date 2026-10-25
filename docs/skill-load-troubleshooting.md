# Skill body load troubleshooting (Agent Plugins 1.0)

Use this when slash commands / plugin catalog **discovery** works but the host **Skill tool** fails to load `SKILL.md` (empty body, GitHub Contents **404** on `.cursor/skills/…`, or fallback to repo docs only).

## Symptom pattern

| Layer | Expected on `main` | Stale registration |
| --- | --- | --- |
| Canonical tree | `skills/<name>/SKILL.md` | Same on disk |
| `.cursor-plugin/plugin.json` | `"skills": "./skills"` | Same in git |
| Discovery / catalog | Skill listed; metadata may show `skillRelativePath: skills/…` | Often still correct |
| Body fetch (Contents API or Skill tool) | `skills/<name>/SKILL.md` | **`.cursor/skills/<name>/SKILL.md`** → **404** |

This split means the **git checkout is correct** but **installed-plugin capability metadata** still points at the pre–0.2.0 path from when `.cursor-plugin/plugin.json` used `"skills": ".cursor/skills"`.

## Verify (local or Cloud VM)

Inspect the host’s cloud plugin manifest (path varies; Cloud Agents often use):

`~/.cursor/plugins/cache/.cloud-plugin-manifest.json`

Find the `renovate-workflow` entry. **`declaredCapabilityPaths.skill`** must list `skills/renovate-*/SKILL.md`, not `.cursor/skills/…`.

Compare a working plugin in the same file (e.g. `editorial-workflow` → `skills/editor-*/SKILL.md`).

Also confirm the content cache matches `main`:

`~/.cursor/plugins/cache/multipliers-dev-renovate-workflow/<pluginId>/<sha>/.cursor-plugin/plugin.json` → `"skills": "./skills"`, and `skills/renovate-loop/SKILL.md` exists (no `.cursor/skills/` tree).

## Fix (supported operator workflow)

**Update/Reinstall alone may not refresh capability paths** (known class of marketplace sync bugs). Prefer a **full marketplace remove and re-add**:

1. **Customize → Plugins** — remove the imported **renovate-workflow** marketplace (not only disable the plugin).
2. Quit and restart Cursor (or reload the Cloud Agent environment).
3. Delete stale cache (optional but recommended if paths stay wrong):
   - `~/.cursor/plugins/cache/multipliers-dev-renovate-workflow/`
4. Re-import: `/add-plugin https://github.com/multipliers-dev/renovate-workflow` then install the plugin from the catalog.
5. Re-check `declaredCapabilityPaths.skill` and GitHub Contents:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' \
     -H 'Accept: application/vnd.github+json' \
     'https://api.github.com/repos/multipliers-dev/renovate-workflow/contents/skills/renovate-loop/SKILL.md?ref=main'
   ```
   Expect **200**. `.cursor/skills/renovate-loop/SKILL.md` on `main` should remain **404** (that tree is not shipped).

6. **Skill tool check (required):** load `renovate-loop` body via the host Skill tool; confirm non-empty markdown and that a relative link (e.g. to `verification.md`) resolves.

## Minimal reproduction (host bug report)

Standalone fixture (not in the production marketplace list): [`examples/plugin-skill-load-min/`](../examples/plugin-skill-load-min/README.md).

Install via local plugin path (`~/.cursor/plugins/local/…`) or a one-off GitHub import of that directory. If body load works for the fixture but not for `renovate-workflow` with stale `declaredCapabilityPaths`, the defect is **plugin-identity registration**, not repository layout.

## Do not use as a fix

- Duplicating skills under `.cursor/skills/` in this repository (masks host stale metadata; violates Agent Plugins 1.0 single canonical tree).
- Moving canonical skills back under `.cursor/skills/`.

## Repository contract (unchanged)

- Agent Plugins 1.0: root `plugin.json` (metadata only); skills at fixed `skills/`.
- Cursor overlay: `.cursor-plugin/plugin.json` and marketplace plugin entry declare `"skills": "./skills"`.

If capability paths stay on `.cursor/skills/…` after a full marketplace remove/re-add on a current commit, treat as a **host bug** (capability index not updated on plugin upgrade) and attach manifest excerpts plus this doc.
