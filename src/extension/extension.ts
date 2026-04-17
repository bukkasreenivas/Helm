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
// Extension activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  // Register the VS Code model executor — all model calls will go through
  // vscode.lm (Copilot) instead of direct HTTP, so no API keys are required.
  registerModelExecutor(createVSCodeModelExecutor());

  const output = vscode.window.createOutputChannel("Helm Agent");
  context.subscriptions.push(output);

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
