# Classifier verification checklist

Run after skill or agent changes to classifier behavior.

- [ ] Load synthetic [examples/example-repo/renovate-policy.yml](../../examples/example-repo/renovate-policy.yml)
- [ ] Classify `typescript` → `low_risk_tooling` / `auto_merge_candidate`
- [ ] Classify unknown package → `unlisted_package` / `investigate`
- [ ] Packet includes all `checks.required` names from policy
- [ ] `policy_version` matches active policy file
- [ ] `npm test` — guardrail fixtures pass
- [ ] Cross-links in SKILL.md resolve within this repository
