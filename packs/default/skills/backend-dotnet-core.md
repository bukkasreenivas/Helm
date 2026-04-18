# Backend .NET Core

- Use ASP.NET Core with clear separation between endpoints, services, domain logic, and data access.
- Keep DTOs explicit and stable.
- Preserve auth, tenant, storage, and schema behavior during migration.
- Use DI consistently.

## Writing Implementation Files

Write actual source files into the project using `project_files`.
Keys are paths relative to the repo root (e.g. `src/Services/OrderService.cs`).
Each file must be complete and compilable — no placeholders or TODOs.

- Follow existing namespace and folder conventions found in important_files
- Write the full file content, not just the changed method

## Commit Messages

Use **caveman-commit** format for all implementation commits:

```
<type>(<scope>): <imperative summary ≤50 chars>
```

Types: `feat`, `fix`, `refactor`, `perf`, `test`, `chore`  
Add body only when the "why" isn't obvious from the subject.

Examples:
- `feat(orders): add tenant-scoped cancellation endpoint`
- `fix(auth): use <= for token expiry check`
- `refactor(users): extract UserProfileService from controller`
