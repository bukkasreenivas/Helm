import * as vscode from "vscode";
import * as path from "node:path";
import { installAgent } from "../commands/install-agent";
import { validateAgent } from "../commands/validate-agent";
import { runWorkflow } from "../commands/run-workflow";
import { uninstallAgent } from "../commands/uninstall-agent";
import { updateAgent } from "../commands/update-agent";
import { registerModelExecutor } from "../lib/model-adapters";
import { createVSCodeModelExecutor } from "./vscode-model-adapter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function promptForTarget(): Promise<string | undefined> {
  const workspaceRoot = getWorkspaceRoot();
  if (workspaceRoot) {
    return workspaceRoot;
  }
  return vscode.window.showInputBox({
    prompt: "Enter the absolute path to the target repository",
    ignoreFocusOut: true,
  });
}

/**
 * Temporarily redirects console.log / console.error to an OutputChannel so
 * that the existing command functions show output in the VS Code UI.
 * Returns a restore function.
 */
function patchConsoleToChannel(output: vscode.OutputChannel): () => void {
  const originalLog = console.log;
  const originalError = console.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.log = (...args: any[]) => output.appendLine(args.map(String).join(" "));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.error = (...args: any[]) => output.appendLine(`[ERROR] ${args.map(String).join(" ")}`);
  return () => {
    console.log = originalLog;
    console.error = originalError;
  };
}

// ---------------------------------------------------------------------------
// Chat participant
// ---------------------------------------------------------------------------

/**
 * Supported @helm chat commands:
 *   @helm run <workflow> for <feature>
 *   @helm run <feature>                (uses default workflow)
 *   @helm install [pack]
 *   @helm validate
 *   @helm update
 *   @helm help
 *
 * Examples:
 *   @helm run enhancement for add-payment-gateway
 *   @helm run bugfix for login-redirect-issue
 *   @helm run for add-dark-mode
 */
function parseChatRequest(userText: string): { intent: string; workflow?: string; feature?: string; pack?: string } {
  const text = userText.trim().toLowerCase();

  // run [workflow] for <feature>
  const runWithWorkflow = /^run\s+(\S+)\s+for\s+(.+)$/i.exec(userText.trim());
  if (runWithWorkflow) {
    return { intent: "run", workflow: runWithWorkflow[1].toLowerCase(), feature: runWithWorkflow[2].trim() };
  }

  // run for <feature>  — default workflow
  const runDefault = /^run\s+for\s+(.+)$/i.exec(userText.trim());
  if (runDefault) {
    return { intent: "run", feature: runDefault[1].trim() };
  }

  // run <feature>  — no workflow keyword, treat the rest as feature label
  const runFeatureOnly = /^run\s+(.+)$/i.exec(userText.trim());
  if (runFeatureOnly) {
    return { intent: "run", feature: runFeatureOnly[1].trim() };
  }

  if (text.startsWith("install")) {
    const parts = text.split(/\s+/);
    return { intent: "install", pack: parts[1] };
  }
  if (text.startsWith("validate")) return { intent: "validate" };
  if (text.startsWith("update")) return { intent: "update" };
  if (text.startsWith("uninstall")) return { intent: "uninstall" };

  return { intent: "help" };
}

function registerChatParticipant(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): void {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    _chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken,
  ): Promise<void> => {
    const parsed = parseChatRequest(request.prompt);
    const target = getWorkspaceRoot();

    if (!target) {
      stream.markdown("No workspace folder is open. Open your project folder in VS Code first.");
      return;
    }

    const restore = patchConsoleToChannel(output);

    try {
      switch (parsed.intent) {
        case "run": {
          if (!parsed.feature) {
            stream.markdown(
              "Please provide a feature label. Example:\n```\n@helm run enhancement for add-payment-gateway\n```",
            );
            return;
          }
          stream.markdown(
            `Running **${parsed.workflow ?? "default"}** workflow for **${parsed.feature}**…\n\nProgress is shown in the *Helm Agent* output channel.`,
          );
          output.show(true);
          await runWorkflow(target, {
            workflow: parsed.workflow,
            feature: parsed.feature,
            dryRun: false,
          });
          stream.markdown(`Workflow completed. Check the *Helm Agent* output channel and the \`helm-agent/runs\` folder for artifacts.`);
          break;
        }

        case "install": {
          stream.markdown(`Installing Helm agent (pack: **${parsed.pack ?? "default"}**)…`);
          output.show(true);
          await installAgent(target, { pack: parsed.pack ?? "default", force: false, runBaseline: false });
          stream.markdown("Agent installed. Run `@helm validate` to confirm.");
          break;
        }

        case "validate": {
          stream.markdown("Validating Helm agent configuration…");
          await validateAgent(target);
          stream.markdown("Validation passed.");
          break;
        }

        case "update": {
          stream.markdown("Updating Helm agent pack…");
          output.show(true);
          await updateAgent(target);
          stream.markdown("Agent updated.");
          break;
        }

        case "uninstall": {
          stream.markdown("Uninstalling Helm agent…");
          await uninstallAgent(target, { purgeRuns: false });
          stream.markdown("Agent uninstalled. Run artifacts were left in place.");
          break;
        }

        default: {
          stream.markdown(
            [
              "**Helm Agent** — available commands:",
              "",
              "| Command | What it does |",
              "|---|---|",
              "| `@helm run <feature>` | Run the default workflow |",
              "| `@helm run <workflow> for <feature>` | Run a specific workflow |",
              "| `@helm install [pack]` | Install the Helm agent in this workspace |",
              "| `@helm validate` | Check the agent configuration |",
              "| `@helm update` | Update the agent pack to the latest version |",
              "| `@helm uninstall` | Remove the agent from this workspace |",
              "",
              "**Example workflows:** `enhancement`, `bugfix`, `review-only`, `project-baseline`",
            ].join("\n"),
          );
        }
      }
    } catch (err) {
      stream.markdown(`**Error:** ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      restore();
    }
  };

  const participant = vscode.chat.createChatParticipant("helm.agent", handler);
  participant.iconPath = new vscode.ThemeIcon("rocket");
  context.subscriptions.push(participant);
}

// ---------------------------------------------------------------------------
// Extension activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  // Register the VS Code model executor — all model calls will go through
  // vscode.lm (Copilot) instead of direct HTTP, so no API keys are required.
  registerModelExecutor(createVSCodeModelExecutor());

  const output = vscode.window.createOutputChannel("Helm Agent");
  context.subscriptions.push(output);

  // Register the @helm Copilot Chat participant.
  registerChatParticipant(context, output);

  // ---- helm.installAgent --------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand("helm.installAgent", async () => {
      const target = await promptForTarget();
      if (!target) return;

      const pack = await vscode.window.showInputBox({
        prompt: "Pack name to install",
        value: "default",
        ignoreFocusOut: true,
      });
      if (pack === undefined) return;

      const restore = patchConsoleToChannel(output);
      output.show(true);
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Helm: Installing agent…", cancellable: false },
        async () => {
          try {
            await installAgent(target, { pack, force: false, runBaseline: false });
            vscode.window.showInformationMessage(
              `Helm agent installed in ${path.basename(target)}`,
            );
          } catch (err) {
            vscode.window.showErrorMessage(
              `Helm install failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          } finally {
            restore();
          }
        },
      );
    }),
  );

  // ---- helm.validateAgent -------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand("helm.validateAgent", async () => {
      const target = await promptForTarget();
      if (!target) return;

      const restore = patchConsoleToChannel(output);
      output.show(true);
      try {
        await validateAgent(target);
        vscode.window.showInformationMessage("Helm agent validation passed.");
      } catch (err) {
        vscode.window.showErrorMessage(
          `Helm validation failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        restore();
      }
    }),
  );

  // ---- helm.runWorkflow ---------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand("helm.runWorkflow", async () => {
      const target = await promptForTarget();
      if (!target) return;

      const feature = await vscode.window.showInputBox({
        prompt: "Feature or domain label (used for run folder naming)",
        ignoreFocusOut: true,
      });
      if (!feature) return;

      const workflow = await vscode.window.showInputBox({
        prompt: "Workflow ID (leave blank to use the project default)",
        ignoreFocusOut: true,
      });
      if (workflow === undefined) return;

      const restore = patchConsoleToChannel(output);
      output.show(true);
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Helm: Running workflow for '${feature}'…`,
          cancellable: false,
        },
        async () => {
          try {
            await runWorkflow(target, {
              workflow: workflow.trim() || undefined,
              feature,
              dryRun: false,
            });
            vscode.window.showInformationMessage(
              `Helm workflow completed for '${feature}'.`,
            );
          } catch (err) {
            vscode.window.showErrorMessage(
              `Helm workflow failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          } finally {
            restore();
          }
        },
      );
    }),
  );

  // ---- helm.updateAgent ---------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand("helm.updateAgent", async () => {
      const target = await promptForTarget();
      if (!target) return;

      const restore = patchConsoleToChannel(output);
      output.show(true);
      try {
        await updateAgent(target);
        vscode.window.showInformationMessage("Helm agent updated successfully.");
      } catch (err) {
        vscode.window.showErrorMessage(
          `Helm update failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        restore();
      }
    }),
  );

  // ---- helm.uninstallAgent ------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand("helm.uninstallAgent", async () => {
      const target = await promptForTarget();
      if (!target) return;

      const purgeChoice = await vscode.window.showQuickPick(
        [
          { label: "No", description: "Keep run artifacts on disk", picked: true },
          { label: "Yes", description: "Also delete the run artifact folder (--purge-runs)" },
        ],
        { placeHolder: "Delete run artifacts?" },
      );
      if (!purgeChoice) return;

      const restore = patchConsoleToChannel(output);
      output.show(true);
      try {
        await uninstallAgent(target, { purgeRuns: purgeChoice.label === "Yes" });
        vscode.window.showInformationMessage("Helm agent uninstalled.");
      } catch (err) {
        vscode.window.showErrorMessage(
          `Helm uninstall failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        restore();
      }
    }),
  );
}

export function deactivate(): void {
  // No explicit cleanup needed — subscriptions are disposed automatically.
}
