# Minimal Agent Plugins 1.0 skill-load fixture

**Not a production plugin.** Use only to reproduce host Skill body loading against a clean plugin identity.

## Layout

- Portable `plugin.json` (metadata only)
- `.cursor-plugin/plugin.json` with `"skills": "./skills"`
- One skill: `skills/test-skill/SKILL.md`
- Supporting doc referenced by relative link: `docs/supporting.md`

No `.cursor/skills/` directory.

## Install (same mechanism as renovate-workflow)

**Local dev (recommended for A/B tests):**

```bash
git clone https://github.com/multipliers-dev/renovate-workflow.git /tmp/renovate-workflow
cp -a /tmp/renovate-workflow/examples/plugin-skill-load-min ~/.cursor/plugins/local/skill-load-min-fixture
```

Restart Cursor or reload the window, enable the plugin if prompted.

**GitHub import (optional):** import this repo as a marketplace, then add a temporary marketplace entry pointing at `examples/plugin-skill-load-min` in a fork — do not add that entry to production `main`.

## Verification

1. Discovery: `test-skill` appears in the plugin skill list.
2. Body load: Skill tool returns the full `SKILL.md` body (marker line `SKILL_LOAD_MIN_MARKER: ok`).
3. Relative link: open `docs/supporting.md` from the skill context (`SUPPORTING_DOC_MARKER: ok`).

Record `declaredCapabilityPaths.skill` for this plugin name in `.cloud-plugin-manifest.json` — paths must be `skills/test-skill/SKILL.md`, not under `.cursor/skills/`.
