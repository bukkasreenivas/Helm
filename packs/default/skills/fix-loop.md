# Fix Loop

- Consume review findings by severity and owner.
- Apply minimal root-cause fixes.
- Re-run the relevant tests after changes.

## Writing Fix Files

Write the fixed source or test files into the project using `project_files`.
Keys are paths relative to the repo root. Write the complete file — not just the diff.

## Caveman Mode

Activate **caveman-full** mode for all fix iterations. Token savings compound across retries.

- State: `[attempt N] fixing: <problem>` at start of each iteration
- On fix applied: `fixed: <what changed>. re-run tests.`
- On test pass: `tests pass. done.`
- On test fail: `still failing: <error>. next fix:`

Use **caveman-commit** for each fix commit:
- `fix(<scope>): <root cause fixed ≤50 chars>`
- Example: `fix(auth): null check before token expiry`
