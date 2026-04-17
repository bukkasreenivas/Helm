import path from "node:path";
import { ensureDir, writeTextFile } from "../lib/fs-utils";
import { writeStageArtifacts } from "../lib/artifact-writer";
import { loadProjectConfig, loadWorkflow } from "../lib/yaml-config";
import { normalizeProjectPath } from "../lib/paths";
import { validateProject } from "../lib/validate";

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

  const config = await loadProjectConfig(repoRoot);
  const workflowId = options.workflow ?? config.manifest.default_workflow;
  const workflow = await loadWorkflow(config.agentControlRoot, workflowId);
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}_${workflowId}_${options.feature.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
  const runDir = normalizeProjectPath(repoRoot, path.join(config.manifest.run_artifact_root, runId));
  await ensureDir(runDir);

  const summaries: string[] = [];

  for (const stage of workflow.stages) {
    const model = config.manifest.role_overrides?.[stage.role] ?? config.models.roles[stage.role] ?? "unassigned";
    const skills = config.roles.roles[stage.role]?.skills ?? [];

    const stageSummary = [
      `# Stage Summary: ${stage.id}`,
      "",
      `- Workflow: ${workflow.workflow_id}`,
      `- Feature: ${options.feature}`,
      `- Role: ${stage.role}`,
      `- Model: ${model}`,
      `- Skills: ${skills.join(", ") || "None"}`,
      `- Dry run: ${options.dryRun ? "yes" : "no"}`,
    ].join("\n");

    const summaryPath = path.join(runDir, `${stage.id}.md`);
    await writeTextFile(summaryPath, stageSummary);
    summaries.push(summaryPath);

    if (!options.dryRun) {
      await writeStageArtifacts(config, stage, options.feature);
    }
  }

  const runSummary = `# Helm Run Summary\n\n- Workflow: ${workflow.workflow_id}\n- Feature: ${options.feature}\n- Run directory: ${runDir}\n- Stage summaries:\n${summaries.map((filePath) => `  - ${filePath}`).join("\n")}\n`;
  await writeTextFile(path.join(runDir, "run-summary.md"), runSummary);
  console.log(`Completed workflow '${workflowId}' for feature '${options.feature}'. Run artifacts: ${runDir}`);
}