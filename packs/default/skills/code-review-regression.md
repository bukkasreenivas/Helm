# Code Review Regression

- Focus on behavioral regressions, missing tests, and broken parity.
- Treat silent contract drift as a major issue.
- Findings first, ordered by severity.

## Caveman Review Format

Use **caveman-review** one-liner format for all findings:

```
<file>:L<line>: <severity> <problem>. <fix>.
```

Severity prefixes:
- `🔴 bug:` — broken behavior, will cause regression
- `🟡 risk:` — untested path or fragile contract
- `🔵 nit:` — minor style or naming issue

Examples:
- `orders.ts:L55: 🔴 bug: status check missing after refactor. Add guard for cancelled state.`
- `user.spec.ts:L30: 🟡 risk: no test for null user response. Add edge case.`

Drop: "I noticed that...", restating what the line does, hedging ("perhaps", "maybe").
Use `❓ q:` prefix for genuine questions, not suggestions.