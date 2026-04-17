# Helm

Helm is a standalone agent control plane for installing structured AI workflow packs into software projects.

It provides:

- role-to-model mapping
- modular skill composition
- declarative workflows
- durable technical, review, and product documentation outputs
- install, validate, run, and update commands

ROAI is the first consumer project for Helm.

## Commands

- `helm install-agent --target <repo> [--run-baseline]`
- `helm validate-agent --target <repo>`
- `helm run-workflow --target <repo> --workflow <id> --feature <name>`
- `helm update-agent --target <repo>`

## Development

1. `npm install`
2. `npm run build`
3. `node dist/cli.js --help`

## Pack layout

Helm ships a default pack under `packs/default/`.
When installed into a consumer repo, the pack is copied into `agent-control/` while durable project documentation remains outside that folder.