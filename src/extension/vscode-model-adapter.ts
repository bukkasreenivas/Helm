import * as vscode from "vscode";
import type { IModelExecutor, ModelExecutionRequest, ModelExecutionResponse } from "../lib/types";

/**
 * Maps the model alias strings from models.yaml to a Copilot model family.
 * The VS Code executor ignores the specific model name and selects the nearest
 * available Copilot model — no API keys are required.
 */
function resolveModelFamily(modelAlias: string): { vendor: string; family: string } | undefined {
  const alias = modelAlias.toLowerCase();
  if (alias.includes("sonnet") || (alias.startsWith("claude") && !alias.includes("haiku"))) {
    return { vendor: "copilot", family: "claude-sonnet-4" };
  }
  if (alias.includes("haiku")) {
    return { vendor: "copilot", family: "claude-3.5-haiku" };
  }
  if (alias.includes("gpt")) {
    return { vendor: "copilot", family: "gpt-4o" };
  }
  if (alias.includes("gemini")) {
    return { vendor: "copilot", family: "gemini-2.0-flash" };
  }
  return undefined;
}

export function createVSCodeModelExecutor(): IModelExecutor {
  return {
    async execute(request: ModelExecutionRequest): Promise<ModelExecutionResponse> {
      // Resolve a preferred model family from the alias in models.yaml
      const hint = resolveModelFamily(request.model);
      let models: vscode.LanguageModelChat[] = [];

      if (hint) {
        models = await vscode.lm.selectChatModels(hint);
      }

      // Fallback: use any available Copilot model
      if (models.length === 0) {
        models = await vscode.lm.selectChatModels({ vendor: "copilot" });
      }

      if (models.length === 0) {
        throw new Error(
          "No Copilot language models available. " +
          "Ensure GitHub Copilot Chat is installed and you are signed in.",
        );
      }

      // Combine system instructions and user prompt into a single user message.
      // The vscode.lm API may not support a separate system role on all models.
      const messages = [
        vscode.LanguageModelChatMessage.User(
          `SYSTEM INSTRUCTIONS:\n${request.systemPrompt}\n\n---\n\n${request.userPrompt}`,
        ),
      ];

      // Try each candidate model in order (provides in-adapter fallback)
      let lastError: unknown;
      for (const model of models.slice(0, 3)) {
        try {
          const tokenSource = new vscode.CancellationTokenSource();
          const response = await model.sendRequest(messages, {}, tokenSource.token);

          let text = "";
          for await (const chunk of response.text) {
            text += chunk;
          }

          return { text, raw: { modelId: model.id, modelFamily: model.family } };
        } catch (err) {
          lastError = err;
        }
      }

      throw lastError;
    },
  };
}
