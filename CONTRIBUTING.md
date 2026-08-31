# Contributing

Thanks for improving renovate-workflow. This repo is the authoritative implementation of the Renovate merge ladder (skills, agents, scripts, and portable policy logic).

## Development setup

```bash
npm install
npm test
npm run typecheck
```

Pre-commit hooks run `npm test` and `npm run typecheck`. Do not bypass them.

## Where changes belong

| Change type | Location |
| --- | --- |
| Portable ladder logic, guardrails, policy interpretation | `.cursor/skills/`, `.agents/`, `scripts/` |
| Consumer-specific facts (package lists, CI job names, paths) | **Not in this repo** — consumer `.agents/renovate-policy.yml` |
| Adoption docs, runbook | `docs/` |
| Plugin / marketplace manifests | `.cursor-plugin/` |

Product logic lives in `scripts/` and plugin assets — not in `src/index.ts` (placeholder entrypoint only).

## Policy and packet changes

When changing policy semantics:

1. Update [`.agents/renovate-policy.template.yml`](.agents/renovate-policy.template.yml)
2. Update the synthetic example [`examples/example-repo/renovate-policy.yml`](examples/example-repo/renovate-policy.yml) (keep `version: "3"` unless intentionally bumping schema)
3. Add or update fixtures under `scripts/fixtures/renovate-packets/`
4. Run `npm test` and `npm run typecheck`

Do not move `examples/example-repo/renovate-policy.yml` without updating hardcoded test paths in the same PR.

## Classifier and packet fixtures

Classification or packet schema changes need YAML fixtures under `scripts/fixtures/renovate-packets/` and passing guardrail / stop-cause / eligibility tests.

## Plugin and marketplace manifests

- Keep `.cursor-plugin/plugin.json` `version` aligned with `package.json` `version`
- `.cursor-plugin/marketplace.json` is install catalog metadata (no version field) — the GitHub-import marketplace wrapper
- Do not add distribution install scripts to consumer repos from this repo

## Pull requests

Use the PR template. Include a test plan. Note if you changed policy schema, packet fixtures, or plugin manifests.

## Security

See [SECURITY.md](SECURITY.md) for reporting merge-authority or credential issues privately.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
