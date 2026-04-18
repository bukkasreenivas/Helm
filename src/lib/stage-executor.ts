import path from "node:path";
import { executeModel, parseStructuredModelResponse } from "./model-adapters";
import { buildPrompts } from "./prompt-builder";
import { getArtifactTemplate } from "./template-map";
import { ensureDir, readTextFile, writeTextFile } from "./fs-utils";
import { normalizeProjectPath } from "./paths";
import { runCommand } from "./command-runner";
import type { LoadedProjectConfig, StageExecutionResult, WorkflowConfig, WorkflowStage } from "./types";

/** Thrown when a stage's test/validation command fails. Carries the artifacts
 *  and command output from that stage so the fixer has full context. */
export class StageCommandFailureError extends Error {
  constructor(
    message: string,
    public readonly createdArtifacts: string[],
    public readonly commandOutput: string,
  ) {
    super(message);
    this.name = "StageCommandFailureError";
  }
}

function artifactFileName(artifact: string, feature: string): string {
  const safeFeature = feature.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const mapping: Record<string, string> = {
    architecture: `architecture_${safeFeature}.md`,
    "code-review": `code_review_${safeFeature}.md`,
    "backend-test-report": `backend_test_report_${safeFeature}.md`,
    "ui-test-report": `ui_test_report_${safeFeature}.md`,
    "release-validation": `release_validation_${safeFeature}.md`,
    "product-doc": `product_doc_${safeFeature}.md`,
    "project-overview": "project_overview.md",
    "solution-map": "solution_map.md",
    "dependency-map": "dependency_map.md",
    "skill-recommendation": "skill_recommendations.md",
    "run-summary": `run_summary_${safeFeature}.md`,
    "implementation-notes": `implementation_notes_${safeFeature}.md`,
    "fix-summary": `fix_summary_${safeFeature}.md`,
  };
  return mapping[artifact] ?? `${artifact}_${safeFeature}.md`;
}

function stageOutputDirectory(config: LoadedProjectConfig, stage: WorkflowStage): string {
  const targetKey = stage.output_target ?? "run_artifact_root";
  return normalizeProjectPath(config.repoRoot, config.manifest[targetKey]);
}

async function loadPriorArtifacts(createdArtifacts: string[]): Promise<string[]> {
  const sections: string[] = [];
  for (const filePath of createdArtifacts) {
    const content = await readTextFile(filePath);
    sections.push(`## Prior Artifact: ${path.basename(filePath)}\n${content.slice(0, 12000)}`);
  }
  return sections;
}

interface RoleCommandResult {
  output: string;
  failed: boolean;
}

/** Re-runs the test command associated with a given role after a fixer has applied changes. */
export async function rerunCommandForRole(config: LoadedProjectConfig, role: string): Promise<RoleCommandResult | undefined> {
  const stageShim = { role } as WorkflowStage;
  return runRoleCommand(config, stageShim);
}

async function runRoleCommand(config: LoadedProjectConfig, stage: WorkflowStage): Promise<RoleCommandResult | undefined> {
  let command: string | undefined;
  switch (stage.role) {
    case "backend_tester":
      command = config.manifest.backend_test_command;
      break;
    case "frontend_tester":
      command = config.manifest.frontend_test_command;
      break;
    case "ui_tester":
      command = config.manifest.ui_e2e_test_command;
      break;
    case "release_validator":
      command = config.manifest.startup_command;
      break;
    default:
      command = undefined;
  }

  if (!command) {
    return undefined;
  }

  const result = await runCommand(command, config.repoRoot);
  const status = result.success ? "succeeded" : `failed (exit ${result.exitCode})`;
  return {
    output: `Command: ${command}\nStatus: ${status}\n\n${result.output}`,
    failed: !result.success,
  };
}

export async function executeStage(
  config: LoadedProjectConfig,
  workflow: WorkflowConfig,
  stage: WorkflowStage,
  feature: string,
  options: { dryRun?: boolean },
  createdArtifacts: string[],
): Promise<StageExecutionResult> {
  const primaryModel = config.manifest.role_overrides?.[stage.role] ?? config.models.roles[stage.role] ?? "unassigned";
  console.log(`\n### Stage: **${stage.id}** (role: ${stage.role}, model: ${primaryModel})\n`);
  const warnings: string[] = [];
  const commandResult = await runRoleCommand(config, stage);
  const priorArtifactContents = await loadPriorArtifacts(createdArtifacts);
  if (commandResult) {
    priorArtifactContents.push(`## Command Output\n${commandResult.output.slice(0, 16000)}`);
  }

  const { systemPrompt, userPrompt } = await buildPrompts(config, workflow, stage, feature, priorArtifactContents);

  let summary = "Dry run completed.";
  let artifactContents: Record<string, string> = {};
  let projectFileContents: Record<string, string> = {};
  let resolvedModel = primaryModel;
  if (!options.dryRun) {
    const candidates = process.env.HELM_MOCK_MODE === "true"
      ? ["mock:default"]
      : [primaryModel, config.models.fallbacks?.[stage.role]].filter((value): value is string => Boolean(value));

    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        const response = await executeModel({
          model: candidate,
          systemPrompt,
          userPrompt,
          temperature: 0.2,
          maxTokens: 16000,
        });

        const parsed = parseStructuredModelResponse(response.text);
        summary = parsed.summary || `Stage ${stage.id} completed.`;
        artifactContents = parsed.artifacts;
        projectFileContents = parsed.projectFiles;
        resolvedModel = candidate;
        if (candidate !== primaryModel) {
          warnings.push(`Primary model '${primaryModel}' failed. Fallback '${candidate}' was used.`);
        }
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  const outputDir = stageOutputDirectory(config, stage);
  await ensureDir(outputDir);

  const stageArtifacts: string[] = [];
  for (const artifact of stage.required_artifacts ?? []) {
    const template = getArtifactTemplate(artifact);
    const content = artifactContents[artifact] || `# ${artifact}\n\n${summary}\n\nTemplate: ${template.description}`;
    const targetPath = path.join(outputDir, artifactFileName(artifact, feature));
    await writeTextFile(targetPath, content);
    stageArtifacts.push(targetPath);
  }

  // Write project files (actual source/test files) back into the repo.
  const writtenFiles: string[] = [];
  for (const [relativePath, content] of Object.entries(projectFileContents)) {
    const absolutePath = path.join(config.repoRoot, relativePath);
    await ensureDir(path.dirname(absolutePath));
    await writeTextFile(absolutePath, content);
    writtenFiles.push(absolutePath);
    console.log(`  wrote: ${relativePath}`);
  }

  // Throw after writing artifacts. StageCommandFailureError carries createdArtifacts + commandOutput
  // so run-workflow.ts can pass them as prior context to the synthetic fixer stage.
  if (commandResult?.failed) {
    throw new StageCommandFailureError(
      `Command failed for stage '${stage.id}'. See command output and test report for details.`,
      [...stageArtifacts, ...writtenFiles],
      commandResult.output,
    );
  }

  return {
    stageId: stage.id,
    role: stage.role,
    model: resolvedModel,
    success: true,
    summary,
    createdArtifacts: [...stageArtifacts, ...writtenFiles],
    writtenFiles,
    warnings,
    commandOutput: commandResult?.output,
  };
}