# Frontend Angular

- Build Angular modules/components with clear routing, guards, services, and form boundaries.
- Preserve user-facing parity during migration.
- Keep code accessible, testable, and Playwright-friendly.

## Writing Implementation Files

Write actual source files into the project using `project_files`.
Keys are paths relative to the repo root (e.g. `src/app/auth/login.component.ts`).
Each file must be complete and compilable — no placeholders or TODOs.

- Follow existing module/component naming conventions found in important_files
- Write the full file content, not just the changed block
- Include the corresponding `.html` template if creating a new component

## Commit Messages

Use **caveman-commit** format for all implementation commits:

```
<type>(<scope>): <imperative summary ≤50 chars>
```

Types: `feat`, `fix`, `refactor`, `style`, `test`, `chore`  
Add body only when the "why" isn't obvious from the subject.

Examples:
- `feat(nav): add role-based route guard`
- `fix(form): prevent double submit on slow network`
- `refactor(auth): split LoginComponent into form + handler`
