# UI Testing Playwright

- Create and run local browser tests for key flows.
- Validate auth, navigation, forms, and critical user paths.
- Prefer resilient selectors and user-observable assertions.

## Writing Test Files

Write actual Playwright test files into the project using `project_files`.
Keys are paths relative to the repo root (e.g. `e2e/auth.spec.ts`).
Each file must be complete and runnable — no placeholders.

- One spec file per feature area (auth, navigation, forms, etc.)
- Use `@playwright/test` imports
- Prefer `getByRole`, `getByLabel`, `getByText` over CSS selectors
- Keep tests independent — no shared state between tests

## Caveman Mode

Use **caveman-lite** for UI test reports. Drop filler; keep sentence structure and pass/fail clarity.

- Report format: `<flow>: pass | fail — <one-line reason if fail>`
- Summary line: `<N> pass, <M> fail. Blockers: <list or none>.`
- No prose preamble before results
