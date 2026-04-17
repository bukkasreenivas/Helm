# Helm Agent — Default Pack

This folder (`helm-agent/`) is managed by [Helm](https://github.com/bukkasreenivas/Helm).  
Do not edit the files here by hand — use the Helm CLI or the `@helm` VS Code chat participant instead.

Durable project outputs (`docs/technical`, `docs/code-review`, `docs/product`) are written **outside** this folder and are preserved across updates and uninstalls.

---

## Running workflows

**Via VS Code / Copilot Chat** (no API keys needed):
```
@helm run <feature>
@helm run <workflow> for <feature>
```

**Via CLI:**
```bash
# Run the default workflow
node dist/cli.js run-workflow --target . --feature "my feature"

# Run a specific workflow
node dist/cli.js run-workflow --target . --workflow review-only --feature "release readiness"

# Dry run (no artifacts written)
node dist/cli.js run-workflow --target . --feature "my feature" --dry-run
```

## Available workflows

| Workflow | Purpose |
|---|---|
| `enhancement` | Architecture → implementation → testing → review → product docs → release validation |
| `bugfix` | Focused implementation and validation for bug fixes |
| `project-baseline` | Repo overview, solution map, dependency map, skill recommendations |
| `review-only` | Review and audit path only |

## Managing this pack

```bash
# Validate the installed pack
node dist/cli.js validate-agent --target .

# Update pack from source
node dist/cli.js update-agent --target .

# Uninstall (keeps durable docs)
node dist/cli.js uninstall-agent --target .

# Uninstall and remove run artifacts
node dist/cli.js uninstall-agent --target . --purge-runs
```

## Pack structure

| File / Folder | Purpose |
|---|---|
| `pack.yaml` | Pack identity and inheritance chain |
| `manifest.yaml` | Durable output folders, artifact root |
| `models.yaml` | Role-to-model mapping and fallback table |
| `roles.yaml` | Role definitions (architect, developer, tester, etc.) |
| `workflows/` | Declarative workflow YAML files |
| `skills/` | Skill instruction files injected into model prompts |
| `templates/` | Output document templates |
| `runs/` | Per-run artifact output (not committed by default) |

## Notes

- `parallel_group` stages currently execute sequentially
- Run artifacts in `runs/` can be added to `.gitignore`
