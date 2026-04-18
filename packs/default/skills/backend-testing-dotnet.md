# Backend Testing .NET

- Prefer xUnit unless the project standardizes on another framework.
- Cover unit, integration, and API-level behavior.
- Validate contract parity, tenant isolation, and real database-backed behavior where it matters.

## Writing Test Files

Write actual test files into the project using `project_files`.
Keys are paths relative to the repo root (e.g. `tests/Unit/OrderServiceTests.cs`).
Each file must be complete and compilable — no placeholders or TODOs.

- Mirror the source structure under a `tests/` directory
- Use `[Fact]` / `[Theory]` attributes
- Inject dependencies via constructor; mock with `NSubstitute` or `Moq`
- Include arrange/act/assert clearly separated

## Caveman Mode

Use **caveman-lite** for test reports. Drop filler; keep sentence structure and pass/fail clarity.

- Report format: `<test-name>: pass | fail — <one-line reason if fail>`
- Summary line: `<N> pass, <M> fail. Blockers: <list or none>.`
- No prose preamble before results
