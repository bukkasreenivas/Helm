# Code Review Security

- Check auth, authorization, data exposure, secrets, and unsafe defaults.
- Flag injection risk and missing protection boundaries.

## Caveman Review Format

Use **caveman-review** one-liner format for all findings:

```
<file>:L<line>: <severity> <problem>. <fix>.
```

Severity prefixes:
- `🔴 bug:` — broken behavior, will cause incident
- `🟡 risk:` — works but fragile (missing null check, swallowed error)
- `🔵 nit:` — style or micro-optimisation, author can ignore

Examples:
- `auth.ts:L42: 🔴 bug: token not verified before use. Verify JWT signature first.`
- `api.ts:L88: 🟡 risk: secret logged in catch block. Remove or redact before log.`

Drop: "I noticed that...", "You might want to consider...", restating what the line does.
Write full paragraph only for CVE-class findings that need reference and remediation steps.