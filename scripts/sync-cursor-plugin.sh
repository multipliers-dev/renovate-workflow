#!/usr/bin/env sh
# Generate distribution/cursor-plugin/ from the canonical renovate-workflow tree.
# cursor-team-marketplace copies plugins/renovate-workflow/ from this output (see docs/adopt.md).
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/distribution/cursor-plugin"
PKG_SCRIPTS="node_modules/renovate-workflow/scripts"

rm -rf "$OUT"
mkdir -p "$OUT/skills" "$OUT/agents/templates" "$OUT/docs" "$OUT/.cursor-plugin"

copy_tree() {
  src=$1
  dest=$2
  if [ -d "$src" ]; then
    cp -R "$src/." "$dest/"
  fi
}

copy_tree "$ROOT/.cursor/skills/renovate-classifier" "$OUT/skills/renovate-classifier"
copy_tree "$ROOT/.cursor/skills/renovate-draft-readiness" "$OUT/skills/renovate-draft-readiness"
copy_tree "$ROOT/.cursor/skills/renovate-investigator" "$OUT/skills/renovate-investigator"
copy_tree "$ROOT/.cursor/skills/renovate-loop" "$OUT/skills/renovate-loop"
copy_tree "$ROOT/.cursor/skills/renovate-maintainer" "$OUT/skills/renovate-maintainer"

cp "$ROOT/.agents/policy-rubric.base.md" "$OUT/agents/"
cp "$ROOT/.agents/renovate-investigator.md" "$OUT/agents/"
cp "$ROOT/.agents/renovate-maintainer.md" "$OUT/agents/"
cp "$ROOT/.agents/renovate-policy.template.yml" "$OUT/agents/"
copy_tree "$ROOT/.agents/templates" "$OUT/agents/templates"

cp "$ROOT/docs/renovate-workflow.md" "$OUT/docs/"
cp "$ROOT/docs/adopt.md" "$OUT/docs/"

cat > "$OUT/.cursor-plugin/plugin.json" <<'EOF'
{
  "name": "renovate-workflow",
  "description": "Portable Renovate merge ladder: classify, investigate, maintainer, loop orchestration.",
  "version": "0.1.0",
  "author": {
    "name": "Michael Truong",
    "email": "michael@multipliers.dev"
  },
  "keywords": ["renovate", "dependencies", "merge-ladder", "classifier", "maintainer"]
}
EOF

cat > "$OUT/README.md" <<'EOF'
# renovate-workflow (Cursor plugin)

Distribution adapter for the portable Renovate merge ladder. **Canonical source:** [multipliers-dev/renovate-workflow](https://github.com/multipliers-dev/renovate-workflow).

## Skills

| Skill | Invoke | Role |
| --- | --- | --- |
| `renovate-classifier` | `/renovate-classifier` | Classify one Renovate PR; emit execution packet |
| `renovate-maintainer` | `/renovate-maintainer` | Execute packet; merge when gated |
| `renovate-investigator` | `/renovate-investigator` | Investigation lane evidence |
| `renovate-loop` | `/renovate-loop` | Orchestrate classify → execute cycles |
| `renovate-draft-readiness` | `/renovate-draft-readiness` | Parked draft readiness comments |

## Portable vs local

Plugin install provides skills, agent prompts, templates, rubric base, and runbook. Consumer repos still need per-repo config and executable scripts — see [docs/adopt.md](docs/adopt.md) in this plugin (synced from renovate-workflow).

Regenerate this tree from canonical repo: `./scripts/sync-cursor-plugin.sh` in renovate-workflow.
EOF

rewrite_paths() {
  file=$1
  # Portable assets: canonical .agents → plugin agents/
  sed -i \
    -e 's|../../../\.agents/policy-rubric\.base\.md|../../agents/policy-rubric.base.md|g' \
    -e 's|../../../\.agents/renovate-policy\.template\.yml|../../agents/renovate-policy.template.yml|g' \
    -e 's|../../../\.agents/renovate-maintainer\.md|../../agents/renovate-maintainer.md|g' \
    -e 's|../../../\.agents/renovate-investigator\.md|../../agents/renovate-investigator.md|g' \
    -e 's|../../../\.agents/templates/|../../agents/templates/|g' \
    -e 's|@\.agents/renovate-maintainer\.md|/renovate-maintainer|g' \
    -e 's|@\.agents/renovate-investigator\.md|/renovate-investigator|g' \
    -e 's|../../../\.cursor/skills/|../|g' \
    -e "s|../../../scripts/|${PKG_SCRIPTS}/|g" \
    -e 's|\.agents/templates/renovate-run-report\.md|../../agents/templates/renovate-run-report.md|g' \
    -e 's|\.agents/templates/renovate-investigation-report\.md|../../agents/templates/renovate-investigation-report.md|g' \
    -e 's|npm exec -- tsx scripts/renovate-freshness-poll.ts|npm exec -- tsx node_modules/renovate-workflow/scripts/renovate-freshness-poll.ts|g' \
    "$file"
}

find "$OUT/skills" "$OUT/agents" "$OUT/docs" -type f \( -name '*.md' -o -name '*.yml' \) | while read -r file; do
  rewrite_paths "$file"
done

# Agent docs: skills and scripts paths
find "$OUT/agents" -type f -name '*.md' | while read -r file; do
  sed -i \
    -e 's|\.\./\.cursor/skills/|../skills/|g' \
    -e 's|\.\./docs/|../docs/|g' \
    -e "s|\.\./scripts/|${PKG_SCRIPTS}/|g" \
    "$file"
done

echo "Wrote $OUT"
