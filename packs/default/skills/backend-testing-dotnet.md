# Backend Testing .NET

- Prefer xUnit unless the project standardizes on another framework.
- Cover unit, integration, and API-level behavior.
- Validate contract parity, tenant isolation, and real database-backed behavior where it matters.

## Caveman Mode

Use **caveman-lite** for test reports. Drop filler; keep sentence structure and pass/fail clarity.

- Report format: `<test-name>: pass | fail — <one-line reason if fail>`
- Summary line: `<N> pass, <M> fail. Blockers: <list or none>.`
- No prose preamble before results