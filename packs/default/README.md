# Helm Default Pack

This directory is copied into a consumer repository as `helm-agent/`.

Durable project outputs are intentionally written outside this folder.

## Typical lifecycle

Install from the Helm repo:

```bash
node dist/cli.js install-agent --target <repo>
```

Validate the installed pack:

```bash
node dist/cli.js validate-agent --target <repo>
```

Run the default workflow:

```bash
node dist/cli.js run-workflow --target <repo> --feature "example feature"
```

Update the installed pack:

```bash
node dist/cli.js update-agent --target <repo>
```

Uninstall the pack:

```bash
node dist/cli.js uninstall-agent --target <repo>
```

Use `--purge-runs` during uninstall if you also want to remove run artifacts. Durable docs outside `helm-agent/` are intentionally preserved.

## Current limitations

- stages in the same `parallel_group` still run sequentially
