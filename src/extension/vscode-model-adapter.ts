import * as vscode from "vscode";
import type { IModelExecutor, ModelExecutionRequest, ModelExecutionResponse } from "../lib/types";

/**
 * Maps the model alias strings from models.yaml to a Copilot model family.
 * The VS Code executor ignores the specific model name and selects the nearest
 * available Copilot model — no API keys are required.
 */
function resolveModelFamily(modelAlias: string): { vendor: string; family: string } | undefined {
  const alias = modelAlias.toLowerCase();

  // Claude Sonnet variants
  if (alias.includes("sonnet")) {
    // Prefer exact version match, fallback to latest sonnet
    if (alias.includes("4.6")) return { vendor: "copilot", family: "claude-sonnet-4.6" };
    if (alias.includes("4.5")) return { vendor: "copilot", family: "claude-sonnet-4.5" };
    return { vendor: "copilot", family: "claude-sonnet-4.6" };
  }

  // Claude Opus variants
  if (alias.includes("opus")) {
    if (alias.includes("4.7")) return { vendor: "copilot", family: "claude-opus-4.7" };
    if (alias.includes("4.6")) return { vendor: "copilot", family: "claude-opus-4.6" };
    return { vendor: "copilot", family: "claude-opus-4.6" };
  }

  // Claude Haiku variants
  if (alias.includes("haiku")) {
    return { vendor: "copilot", family: "claude-haiku-4.5" };
  }

  // Generic claude — default to sonnet
  if (alias.startsWith("claude")) {
    return { vendor: "copilot", family: "claude-sonnet-4.6" };
  }

  // GPT variants
  if (alias.includes("gpt")) {
    if (alias.includes("5.4")) return { vendor: "copilot", family: "gpt-5.4" };
    if (alias.includes("5.3")) return { vendor: "copilot", family: "gpt-5.3-codex" };
    if (alias.includes("5.2")) return { vendor: "copilot", family: "gpt-5.2" };
    if (alias.includes("4o")) return { vendor: "copilot", family: "gpt-4o" };
    return { vendor: "copilot", family: "gpt-5.4" };
  }

  // Gemini variants
  if (alias.includes("gemini")) {
    if (alias.includes("3.1")) return { vendor: "copilot", family: "gemini-3.1-pro" };
    if (alias.includes("2.5")) return { vendor: "copilot", family: "gemini-2.5-pro" };
    if (alias.includes("flash")) return { vendor: "copilot", family: "gemini-3-flash" };
    return { vendor: "copilot", family: "gemini-3.1-pro" };
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
          let chunkCount = 0;
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error("Model response stream timeout after 5 minutes")), 300000)
          );

          try {
            for await (const chunk of response.text) {
              text += chunk;
              chunkCount++;
            }
          } catch (err) {
            // If we got at least one chunk, return what we have so far
            if (chunkCount > 0 && text.length > 0) {
              console.warn(`Model stream interrupted after ${chunkCount} chunks (${text.length} chars), returning partial response`);
              return { text, raw: { modelId: model.id, modelFamily: model.family } };
            }
            throw err;
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
