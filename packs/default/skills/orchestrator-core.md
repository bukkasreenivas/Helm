# Orchestrator Core

- Load manifest, models, roles, and workflows.
- Resolve roles to models from config only.
- Treat repo root as authoritative scope.
- Pass forward only the minimum complete context for each stage.
- Stop when mandatory artifacts or prerequisites are missing.