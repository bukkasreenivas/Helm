# Helm

Helm is a standalone agent control plane for installing structured AI workflow packs into software projects.

It provides:

- role-to-model mapping
- modular skill composition
- declarative workflows
- durable technical, review, and product documentation outputs
- install, validate, run, update, and uninstall commands

Helm is repository-agnostic. It ships a default pack and supports optional override packs without coupling the product to any one consumer repository.

## Install

Build Helm locally:

```bash
npm install
npm run build
```

Install the default pack into a target repository:

```bash
node dist/cli.js install-agent --target <repo>
```

Install a named pack and generate the baseline artifacts immediately:

```bash
node dist/cli.js install-agent --target <repo> --pack webapp --run-baseline
```

What this does:

- creates `helm-agent/` in the target repository
- writes pack config files, workflows, skills, and templates
- creates durable output folders defined by the manifest
- optionally runs the `project-baseline` workflow

## Update

Refresh an installed pack from the current Helm source:

```bash
node dist/cli.js update-agent --target <repo>
```

The update keeps the installed pack selection and rolls back automatically if validation fails.

## Uninstall

Remove Helm from a target repository while keeping durable docs:

```bash
node dist/cli.js uninstall-agent --target <repo>
```

Remove Helm and its run artifacts:

```bash
node dist/cli.js uninstall-agent --target <repo> --purge-runs
```

Uninstall removes `helm-agent/`. By design, durable docs such as `docs/technical`, `docs/code-review`, and `docs/product` are left alone unless you remove them yourself.

## Validate

Check that an installed pack is structurally valid:

```bash
node dist/cli.js validate-agent --target <repo>
```

## Use Helm

Run the default workflow for a feature:

```bash
node dist/cli.js run-workflow --target <repo> --feature "tenant audit trail"
```

Run a specific workflow:

```bash
node dist/cli.js run-workflow --target <repo> --workflow review-only --feature "release readiness"
```

Run without writing durable artifacts:

```bash
node dist/cli.js run-workflow --target <repo> --workflow enhancement --feature "pricing page refresh" --dry-run
```

Built-in workflows:

- `enhancement`: architecture, implementation, testing, review, product docs, release validation
- `bugfix`: focused implementation and validation flow for fixes
- `project-baseline`: repository overview, solution map, dependency map, skill recommendations
- `review-only`: review-only path for audit or release checks

Model execution behavior:

- Helm uses the role-to-model mapping in `helm-agent/models.yaml`
- fallback models are used when the primary model fails
- set `HELM_MOCK_MODE=true` to run with the built-in mock adapter for local validation
- provider API keys are required for real model execution: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_API_KEY` depending on configured models

## Commands

- `helm install-agent --target <repo> [--pack <name>] [--run-baseline]`
- `helm validate-agent --target <repo>`
- `helm uninstall-agent --target <repo> [--purge-runs]`
- `helm run-workflow --target <repo> --workflow <id> --feature <name>`
- `helm update-agent --target <repo>`

## Development

1. `npm install`
2. `npm run build`
3. `npm test`
4. `node dist/cli.js --help`

## Pack layout

Helm ships a default pack under `packs/default/` and a generic sample override pack under `packs/webapp/`.
When installed into a consumer repo, the pack is copied into `helm-agent/` while durable project documentation remains outside that folder.

## Implementation status

Helm is functional, but it is not fully complete as a production platform yet.

Implemented now:

- install, validate, update, uninstall, and workflow execution commands
- pack inheritance and named pack installation
- provider adapters for OpenAI, Anthropic, Google, plus a mock adapter
- baseline scanning with filtering for generated outputs
- automated tests for pack composition and scan filtering

Still missing or shallow:

- stage execution generates artifacts, but it does not directly modify application code in the target repo
- no packaged release flow yet beyond local build and git publishing
- no provider-specific retry, rate-limit handling, or resume support
- no end-to-end tests against real provider APIs

## Known limitations

- `parallel_group` is advisory only right now; stages still execute sequentially