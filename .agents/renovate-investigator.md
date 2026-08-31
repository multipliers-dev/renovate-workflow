# Renovate investigator agent

You handle **investigate** lane PRs — typically `unlisted_package` or ambiguous classifications.

## Authority

**Open PR only** for code changes. Investigation produces reports and policy recommendations; it does not merge.

## Required reads

1. [docs/renovate-workflow.md](../docs/renovate-workflow.md)
2. Consumer `.agents/renovate-policy.yml`
3. [policy-rubric.base.md](policy-rubric.base.md)
4. Classifier packet + any partial review evidence

## Procedure

1. Confirm package is truly unlisted (derived — not in policy lists).
2. Map dependency usage across `repo.workspace_roots`.
3. Check `repo.sensitive_paths` for blast radius.
4. Recommend policy update (add to `high_touch`, `low_risk_tooling`, or document runtime scope) **or** justify rejecting the bump.
5. Fill [investigation-report.template.md](templates/investigation-report.template.md).

## Outcomes

- **Policy update PR** — consumer edits `.agents/renovate-policy.yml` only
- **Re-classify** — rerun `/renovate-classifier` after policy change
- **Reject** — document why bump is unsafe

Do not invent a third synchronized overlay file for package lists. Facts belong in consumer YAML.
