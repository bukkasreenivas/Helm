import path from "node:path";
import { ensureDir, writeTextFile } from "../lib/fs-utils";
import { executeStage, StageCommandFailureError, rerunCommandForRole } from "../lib/stage-executor";
import { loadProjectConfig, loadWorkflow } from "../lib/yaml-config";
import { normalizeProjectPath } from "../lib/paths";
import { validateProject } from "../lib/validate";
import type { LoadedProjectConfig, WorkflowConfig, WorkflowStage } from "../lib/types";

// ---------------------------------------------------------------------------
// Fixer role resolution
// Convention: backend_* and frontend_* domains each have a dedicated fixer.
// ui_* is treated as part of the frontend domain.
// ---------------------------------------------------------------------------
function resolveFixerRole(failedRole: string): string | undefined {
  if (failedRole.startsWith("backend_")) return "backend_fixer";
  if (failedRole.startsWith("frontend_") || failedRole.startsWith("ui_")) return "frontend_fixer";
  return undefined;
}

/**
 * Compute the full set of ancestor stage IDs for a given stage by walking
 * the depends_on graph transitively. Returns a Set of stage IDs (not
 * including the stage itself) so that each stage receives artifacts from
 * every upstream stage in its lineage — not just its direct parents.
 *
 * Example (enhancement workflow):
 *   release_validation depends_on product_documentation
 *   product_documentation depends_on backend_fix + frontend_fix
 *   backend_fix depends_on code_review → backend_testing → backend_implementation → architecture
 *   → release_validation receives artifacts from ALL of those stages
 */
function collectAncestorStageIds(
  stageId: string,
  dependsOnMap: Map<string, string[]>,
  visited = new Set<string>(),
): Set<string> {
  if (visited.has(stageId)) return visited;
  visited.add(stageId);
  for (const parent of dependsOnMap.get(stageId) ?? []) {
    collectAncestorStageIds(parent, dependsOnMap, visited);
  }
  return visited;
}

/**
 * Collect artifacts from every ancestor of a stage (transitively), preserving
 * the order in which stages were executed so that earlier context comes first.
 */
function collectRelevantArtifacts(
  stage: WorkflowStage,
  stageArtifactMap: Map<string, string[]>,
  dependsOnMap: Map<string, string[]>,
): string[] {
  const ancestors = collectAncestorStageIds(stage.id, dependsOnMap);
  ancestors.delete(stage.id); // exclude the stage itself
  const relevant: string[] = [];
  // Iterate stageArtifactMap in insertion order (= execution order) so context is chronological.
  for (const [id, artifacts] of stageArtifactMap) {
    if (ancestors.has(id)) {
      relevant.push(...artifacts);
    }
  }
  return relevant;
}

/**
 * Run a single stage and return its artifacts.
 * Throws if the stage fails and there is no recovery path.
 * When on_failure is "route_to_fixer" the fixer stage is run instead and its
 * artifacts are returned — the run continues rather than aborting.
 */
async function runStage(
  config: LoadedProjectConfig,
  workflow: WorkflowConfig,
  stage: WorkflowStage,
  feature: string,
  dryRun: boolean | undefined,
  relevantArtifacts: string[],
  runDir: string,
  summaries: string[],
  stageArtifactMap: Map<string, string[]>,
): Promise<string[]> {
  try {
    const result = await executeStage(config, workflow, stage, feature, { dryRun }, relevantArtifacts);
    if (result.writtenFiles.length > 0) {
      console.log(`  Stage '${stage.id}' wrote ${result.writtenFiles.length} project file(s).`);
    }
    const skills = config.roles.roles[stage.role]?.skills ?? [];
    const stageSummary = buildStageSummary(workflow, stage, feature, result.model, skills, result.summary, result.writtenFiles, dryRun);
    const summaryPath = path.join(runDir, `${stage.id}.md`);
    await writeTextFile(summaryPath, stageSummary);
    summaries.push(summaryPath);
    return result.createdArtifacts;
  } catch (err) {
    if (stage.on_failure !== "route_to_fixer") {
      throw err;
    }

    const fixerRole = resolveFixerRole(stage.role);
    if (!fixerRole || !(fixerRole in config.roles.roles)) {
      throw new Error(
        `Stage '${stage.id}' failed and on_failure=route_to_fixer, but no fixer role found for '${stage.role}'. Original error: ${String(err)}`,
      );
    }

    // Pull artifacts and command output from the failed stage (if available) so the
    // fixer has the test report and written files as prior context.
    const failedArtifacts = err instanceof StageCommandFailureError ? err.createdArtifacts : [];
    const failedCommandOutput = err instanceof StageCommandFailureError ? err.commandOutput : undefined;

    console.log(
      `Stage '${stage.id}' failed (${String(err)}). Routing to fixer role '${fixerRole}'.`,
    );

    // Build a synthetic fixer stage derived from the failed stage.
    const fixerStage: WorkflowStage = {
      ...stage,
      id: `${stage.id}_fixer`,
      role: fixerRole,
      required_artifacts: ["fix-summary"],
      output_target: "run_artifact_root",
      on_failure: "stop",
    };

    // Give the fixer: ancestor artifacts + failed stage's test report + written files.
    const fixerContext = [...relevantArtifacts, ...failedArtifacts];
    if (failedCommandOutput) {
      // Write command output as a temp artifact file so loadPriorArtifacts can include it.
      const cmdOutputPath = path.join(runDir, `${stage.id}_command_output.txt`);
      await writeTextFile(cmdOutputPath, `# Command Output: ${stage.id}\n\n${failedCommandOutput}`);
      fixerContext.push(cmdOutputPath);
    }

    const fixerResult = await executeStage(config, workflow, fixerStage, feature, { dryRun }, fixerContext);
    if (fixerResult.writtenFiles.length > 0) {
      console.log(`  Stage '${fixerStage.id}' wrote ${fixerResult.writtenFiles.length} project file(s).`);
    }
    const fixerSkills = config.roles.roles[fixerRole]?.skills ?? [];
    const fixerSummary = buildStageSummary(workflow, fixerStage, feature, fixerResult.model, fixerSkills, fixerResult.summary, fixerResult.writtenFiles, dryRun);
    const fixerSummaryPath = path.join(runDir, `${fixerStage.id}.md`);
    await writeTextFile(fixerSummaryPath, fixerSummary);
    summaries.push(fixerSummaryPath);
    // Re-run the original stage's test command to validate the fix.
    if (!dryRun) {
      const rerun = await rerunCommandForRole(config, stage.role);
      if (rerun) {
        if (rerun.failed) {
          console.log(`  Tests still failing after fixer for '${stage.id}'. Workflow continues but fixes may be incomplete.`);
        } else {
          console.log(`  Tests passed after fixer for '${stage.id}'.`);
        }
      }
    }

    // Record fixer artifacts in the map so downstream transitive scoping picks them up.
    stageArtifactMap.set(fixerStage.id, fixerResult.createdArtifacts);
    return fixerResult.createdArtifacts;
  }
}

function buildStageSummary(
  workflow: WorkflowConfig,
  stage: WorkflowStage,
  feature: string,
  model: string,
  skills: string[],
  summary: string,
  writtenFiles: string[],
  dryRun: boolean | undefined,
): string {
  const lines = [
    `# Stage Summary: ${stage.id}`,
    "",
    `- Workflow: ${workflow.workflow_id}`,
    `- Feature: ${feature}`,
    `- Role: ${stage.role}`,
    `- Model: ${model}`,
    `- Skills: ${skills.join(", ") || "None"}`,
    `- Dry run: ${dryRun ? "yes" : "no"}`,
    "",
    "## Summary",
    summary,
  ];
  if (writtenFiles.length > 0) {
    lines.push("", "## Written Files", ...writtenFiles.map((f) => `- ${f}`));
  }
  return lines.join("\n");
}

export async function runWorkflow(
  target: string,
  options: { workflow?: string; feature: string; dryRun?: boolean; skipValidate?: boolean },
): Promise<void> {
  const repoRoot = path.resolve(target);

  if (!options.skipValidate) {
    const validation = await validateProject(repoRoot);
    if (!validation.ok) {
      throw new Error(`Cannot run workflow. Validation failed:\n${validation.errors.join("\n")}`);
    }
  }

  console.log(`Loading project configuration…`);
  const config = await loadProjectConfig(repoRoot);
  const workflowId = options.workflow ?? config.manifest.default_workflow;
  console.log(`Loading workflow '${workflowId}'…`);
  const workflow = await loadWorkflow(config.agentControlRoot, workflowId, config.projectConfigRoot);
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}_${workflowId}_${options.feature.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
  const runDir = normalizeProjectPath(repoRoot, path.join(config.manifest.run_artifact_root, runId));
  await ensureDir(runDir);

  const summaries: string[] = [];
  const allCreatedArtifacts: string[] = [];
  const stageArtifactMap = new Map<string, string[]>();
  // Pre-build the depends_on lookup used by collectRelevantArtifacts.
  const dependsOnMap = new Map<string, string[]>(
    workflow.stages.map((s) => [s.id, s.depends_on]),
  );

  for (const stage of workflow.stages) {
    if (stage.parallel_group) {
      console.log(
        `Note: stage '${stage.id}' belongs to parallel_group '${stage.parallel_group}' but is running sequentially. Parallel execution is not yet supported.`,
      );
    }

    const relevantArtifacts = collectRelevantArtifacts(stage, stageArtifactMap, dependsOnMap);
    const stageArtifacts = await runStage(config, workflow, stage, options.feature, options.dryRun, relevantArtifacts, runDir, summaries, stageArtifactMap);

    stageArtifactMap.set(stage.id, stageArtifacts);
    // If a fixer stage was injected (id = <stage>_fixer), record it in both maps
    // so downstream stages treat fixer output as part of the ancestor chain.
    const fixerId = `${stage.id}_fixer`;
    if (!stageArtifactMap.has(fixerId)) {
      // No fixer was needed — nothing to add.
    } else {
      dependsOnMap.set(fixerId, [stage.id]);
    }
    allCreatedArtifacts.push(...stageArtifacts);
  }

  const runSummary = `# Helm Run Summary\n\n- Workflow: ${workflow.workflow_id}\n- Feature: ${options.feature}\n- Run directory: ${runDir}\n- Stage summaries:\n${summaries.map((filePath) => `  - ${filePath}`).join("\n")}\n- Durable artifacts:\n${allCreatedArtifacts.map((filePath) => `  - ${filePath}`).join("\n")}\n`;
  await writeTextFile(path.join(runDir, "run-summary.md"), runSummary);
  console.log(`Completed workflow '${workflowId}' for feature '${options.feature}'. Run artifacts: ${runDir}`);
}