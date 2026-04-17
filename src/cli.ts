#!/usr/bin/env node
import { Command } from "commander";
import { installAgent } from "./commands/install-agent";
import { uninstallAgent } from "./commands/uninstall-agent";
import { validateAgent } from "./commands/validate-agent";
import { runWorkflow } from "./commands/run-workflow";
import { updateAgent } from "./commands/update-agent";
import pkg from "../package.json";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("helm")
    .description("Helm: standalone agent control plane")
    .version(pkg.version);

  program
    .command("install-agent")
    .requiredOption("--target <path>", "Path to the consumer repository")
    .option("--pack <name>", "Pack name to install", "default")
    .option("--force", "Overwrite an existing agent-control folder")
    .option("--run-baseline", "Run the project-baseline workflow after install")
    .action(async (options) => installAgent(options.target, { force: Boolean(options.force), runBaseline: Boolean(options.runBaseline), pack: options.pack }));

  program
    .command("validate-agent")
    .requiredOption("--target <path>", "Path to the consumer repository")
    .action(async (options) => validateAgent(options.target));

  program
    .command("uninstall-agent")
    .requiredOption("--target <path>", "Path to the consumer repository")
    .option("--purge-runs", "Also remove the configured run artifact folder")
    .action(async (options) => uninstallAgent(options.target, { purgeRuns: Boolean(options.purgeRuns) }));

  program
    .command("run-workflow")
    .requiredOption("--target <path>", "Path to the consumer repository")
    .option("--workflow <id>", "Workflow id to run")
    .requiredOption("--feature <name>", "Feature, domain, or run label")
    .option("--dry-run", "Create run summaries without durable artifacts")
    .action(async (options) =>
      runWorkflow(options.target, {
        workflow: options.workflow,
        feature: options.feature,
        dryRun: Boolean(options.dryRun),
      }),
    );

  program
    .command("update-agent")
    .requiredOption("--target <path>", "Path to the consumer repository")
    .action(async (options) => updateAgent(options.target));

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});