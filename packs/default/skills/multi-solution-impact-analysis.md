# Multi-Solution Impact Analysis

- Identify all affected solutions, apps, shared libraries, and test suites.
- Treat auth, tenancy, storage, and shared schemas as high-blast-radius areas.
- Require explicit mention of all impacted subsystems before implementation starts.

## Caveman Mode

Use **caveman-lite** for impact analysis outputs. Drop hedging; state blast radius directly.

- Format: `<subsystem>: <impact level> — <one-line reason>`
- Example: `auth-service: HIGH — token format change breaks all consumers`
- Group by blast radius: HIGH / MEDIUM / LOW