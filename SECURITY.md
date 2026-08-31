# Security policy

## Supported versions

Security fixes apply to the default branch (`main`) of [multipliers-dev/renovate-workflow](https://github.com/multipliers-dev/renovate-workflow).

## Reporting a vulnerability

**Do not open a public GitHub issue** for unfixed vulnerabilities related to:

- Merge authority bypass or expansion
- Credential handling in skills, scripts, or documentation
- Policy or packet semantics that could allow unintended merges

Instead, report privately via [GitHub Security Advisories](https://github.com/multipliers-dev/renovate-workflow/security/advisories/new) for this repository.

Include:

- Description of the issue and potential impact
- Steps to reproduce (if applicable)
- Suggested fix (optional)

Please report security-sensitive issues privately so they can be investigated before public discussion.

## Scope notes

This product governs **manual** Renovate PR handling inside Cursor. It is not the Renovate bot itself. Issues in upstream Renovate, Cursor, or GitHub APIs should be reported to those projects unless they directly compromise this ladder's merge gates.
