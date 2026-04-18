# UI Testing Playwright

- Create and run local browser tests for key flows.
- Validate auth, navigation, forms, and critical user paths.
- Prefer resilient selectors and user-observable assertions.

## Caveman Mode

Use **caveman-lite** for UI test reports. Drop filler; keep sentence structure and pass/fail clarity.

- Report format: `<flow>: pass | fail — <one-line reason if fail>`
- Summary line: `<N> pass, <M> fail. Blockers: <list or none>.`
- No prose preamble before results