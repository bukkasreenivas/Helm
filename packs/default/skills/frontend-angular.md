# Frontend Angular

- Build Angular modules/components with clear routing, guards, services, and form boundaries.
- Preserve user-facing parity during migration.
- Keep code accessible, testable, and Playwright-friendly.

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