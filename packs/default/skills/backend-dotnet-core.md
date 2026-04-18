# Backend .NET Core

- Use ASP.NET Core with clear separation between endpoints, services, domain logic, and data access.
- Keep DTOs explicit and stable.
- Preserve auth, tenant, storage, and schema behavior during migration.
- Use DI consistently.

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