# Orchestrator Core

- Load manifest, models, roles, and workflows.
- Resolve roles to models from config only.
- Treat repo root as authoritative scope.
- Pass forward only the minimum complete context for each stage.
- Stop when mandatory artifacts or prerequisites are missing.

## Caveman Mode

Activate **caveman-full** mode at workflow start. This applies to all downstream stages in the run.

- Drops articles, filler, pleasantries, and hedging from all stage outputs
- Fragments OK. Short synonyms preferred. Technical terms stay exact.
- Code blocks, commit messages, and templates are written normally
- Deactivate only for: security warnings, irreversible action confirmations

Pass `caveman_mode: full` in the context bundle forwarded to each stage.