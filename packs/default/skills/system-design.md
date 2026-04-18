# System Design

- Consider interfaces, data flow, contracts, rollout, rollback, and observability.
- Preserve compatibility where parity is required.
- Separate infrastructure stabilization from framework migration.

## Caveman Mode

Use **caveman-lite** for all system design outputs. Drop hedging and filler; keep grammar and technical precision.

- State trade-offs directly: "Option A: simpler, higher latency. Option B: complex, lower latency."
- Use short forms: "DB" not "database", "auth" not "authentication layer"
- Tables preferred over prose for comparison sections