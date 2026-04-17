# Helm

Helm is a standalone agent control plane for installing structured AI workflow packs into software projects.

It runs as both a **CLI tool** and a **VS Code extension** with native [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) integration via the `@helm` chat participant.

It provides:

- role-to-model mapping
- modular skill composition
- declarative workflows with `on_failure` routing to fixer roles
- durable technical, review, and product documentation outputs
- install, validate, run, update, and uninstall commands
- VS Code extension with `@helm` Copilot Chat participant

Helm is repository-agnostic. It ships a default pack and supports optional override packs without coupling the product to any one consumer repository.

---

## VS Code Extension

### Installation

Build the extension locally:

```bash
npm install
npm run build:ext
```

Then press **F5** in VS Code to launch the Extension Development Host, or package and install the `.vsix`:

```bash
npx vsce package
code --install-extension helm-agent-control-*.vsix
```

The extension activates automatically when the workspace is opened or when `@helm` is used in Copilot Chat.

### @helm Copilot Chat participant

Once the extension is active, use `@helm` in the Copilot Chat panel — no API keys required when using Copilot as the model provider:

| Command | What it does |
|---|---|
| `@helm run <feature>` | Runs the default workflow for a feature |
| `@helm run <workflow> for <feature>` | Runs a named workflow for a feature |
| `@helm install` | Installs the default pack into the current workspace |
| `@helm install <pack>` | Installs a named pack |
| `@helm validate` | Validates the installed pack |
| `@helm update` | Updates the installed pack from source |
| `@helm uninstall` | Removes the installed pack (preserves durable docs) |
| `@helm help` | Lists all available commands |

Progress is streamed into the chat response and the **Helm Agent** output channel.

### Extension commands (Command Palette)

All commands are also available via `Ctrl+Shift+P`:

- **Helm: Install Agent** — installs the default pack
- **Helm: Validate Agent** — validates the installed pack
- **Helm: Run Workflow** — prompts for workflow and feature name
- **Helm: Update Agent** — refreshes pack from source
- **Helm: Uninstall Agent** — removes the pack

---

## CLI

### Install

Build the CLI:

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

### Update

Refresh an installed pack from the current Helm source:

```bash
node dist/cli.js update-agent --target <repo>
```

The update keeps the installed pack selection and rolls back automatically if validation fails.

### Uninstall

Remove Helm from a target repository while keeping durable docs:

```bash
node dist/cli.js uninstall-agent --target <repo>
```

Remove Helm and its run artifacts:

```bash
node dist/cli.js uninstall-agent --target <repo> --purge-runs
```

Uninstall removes `helm-agent/`. By design, durable docs such as `docs/technical`, `docs/code-review`, and `docs/product` are left alone unless you remove them yourself.

### Validate

Check that an installed pack is structurally valid:

```bash
node dist/cli.js validate-agent --target <repo>
```

### Run workflows

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

### CLI reference

```
node dist/cli.js install-agent  --target <repo> [--pack <name>] [--run-baseline]
node dist/cli.js validate-agent --target <repo>
node dist/cli.js uninstall-agent --target <repo> [--purge-runs]
node dist/cli.js run-workflow   --target <repo> --workflow <id> --feature <name> [--dry-run]
node dist/cli.js update-agent   --target <repo>
```

---

## Built-in workflows

| Workflow | Purpose |
|---|---|
| `enhancement` | Architecture, implementation, testing, review, product docs, release validation |
| `bugfix` | Focused implementation and validation flow for fixes |
| `project-baseline` | Repository overview, solution map, dependency map, skill recommendations |
| `review-only` | Review-only path for audit or release checks |

---

## Model execution

Helm resolves models from `helm-agent/models.yaml` at runtime.

**VS Code extension (recommended):** uses GitHub Copilot as the model provider — no API keys needed.

**CLI:** uses direct provider HTTP adapters — requires API keys set in the environment or `.env`:

| Variable | Provider |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (Sonnet, Haiku) |
| `OPENAI_API_KEY` | GPT-4o |
| `GOOGLE_API_KEY` | Gemini |
| `HELM_MOCK_MODE=true` | Built-in mock adapter (local validation, no API calls) |

Fallback models are used automatically when the primary model fails.

---

## Development

```bash
npm install
npm run build        # CLI build
npm run build:ext    # VS Code extension build
npm test             # 11 tests across 3 test files
node dist/cli.js --help
```

---

## Pack layout

Helm ships a `default` pack under `packs/default/` and a `webapp` override pack under `packs/webapp/`.  
When installed, the pack is copied into `helm-agent/` in the consumer repo. Durable project documentation lives outside that folder and survives uninstall.

**Legacy migration:** repos previously using `agent-control/` are automatically migrated to `helm-agent/` on the first `update-agent` run.

---

## Implementation status

Implemented:

- install, validate, update, uninstall, and workflow execution commands
- `on_failure: route_to_fixer` — failed stages are automatically routed to the configured fixer role
- transitive artifact scoping — downstream stages receive all ancestor artifacts, not just direct depends-on
- pack inheritance and named pack installation with cycle detection
- provider adapters for OpenAI, Anthropic, Google, plus a mock adapter
- VS Code extension with `@helm` Copilot Chat participant
- cross-platform shell execution
- baseline scanning with filtering for generated outputs
- automated tests for pack composition, scan filtering, failure routing, and artifact scoping

Still missing or shallow:

- stage execution generates artifacts, but it does not directly modify application code in the target repo
- no packaged release flow yet beyond local build and git publishing
- no provider-specific retry, rate-limit handling, or resume support
- no end-to-end tests against real provider APIs
- `parallel_group` is advisory only; stages still execute sequentially