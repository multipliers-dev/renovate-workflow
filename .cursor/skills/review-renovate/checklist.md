# Review checklist (major / high-touch bumps)

## Upstream

- [ ] Read release notes for target version range
- [ ] List breaking changes that **could** apply
- [ ] Note deprecations affecting this repo

## Repo usage

- [ ] Locate imports/config for the package under `workspace_roots`
- [ ] Mark breaking changes as **applicable** or **not applicable** with file evidence

## Custom risk

- [ ] Scan `repo.sensitive_paths` for related config
- [ ] Document plugin/build/tooling interactions (e.g. Vite plugins)

## Validation

- [ ] All `checks.required` green on PR HEAD
- [ ] Preview/deploy smoke if policy or team requires it
- [ ] Record commands run and outcomes

## Decision framing

State explicitly:

- Migration required: yes/no
- If no — what evidence proved it
- If yes — scoped implementation plan (separate PR/slice)
