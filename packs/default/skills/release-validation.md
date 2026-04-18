# Release Validation

- Confirm startup succeeds.
- Confirm backend and UI tests are green.
- Confirm critical user journeys are validated.
- Block release if critical review issues remain unresolved.

## Caveman Mode

Use **caveman-lite** for release validation output. Drop filler; keep sentence structure.

- Gate format: `<gate>: pass | BLOCK — <reason if blocked>`
- Final line: `release: ready | BLOCKED by <gate list>`