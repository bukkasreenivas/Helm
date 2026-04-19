import path from "node:path";
import { pathExists } from "./fs-utils";
import { loadProjectConfig, loadWorkflow } from "./yaml-config";
import { normalizeProjectPath } from "./paths";
import type { ValidationResult } from "./types";

const REQUIRED_MANIFEST_KEYS = [
  "schema_version",
  "project_id",
  "project_name",
  "root_path",
  "default_workflow",
  "run_artifact_root",
  "technical_doc_root",
  "review_doc_root",
  "product_doc_root",
] as const;

export async function validateProject(repoRoot: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let config;
  try {
    config = await loadProjectConfig(repoRoot);
  } catch (error) {
    return {
      ok: false,
      errors: [`Failed to load project config: ${String(error)}`],
      warnings,
    };
  }

  for (const key of REQUIRED_MANIFEST_KEYS) {
    if (!(key in config.manifest)) {
      errors.push(`manifest.yaml is missing required key: ${key}`);
    }
  }

  if (!(await pathExists(config.manifest.root_path))) {
    errors.push(`manifest.root_path does not exist: ${config.manifest.root_path}`);
  }

  for (const [roleName] of Object.entries(config.roles.roles)) {
    if (!(roleName in config.models.roles)) {
      errors.push(`Role '${roleName}' exists in roles.yaml but not models.yaml`);
    }
  }

  // Always validate the default workflow; project-baseline is optional in custom packs.
  const workflowsToCheck = [config.manifest.default_workflow];
  if (config.manifest.default_workflow !== "project-baseline") {
    workflowsToCheck.push("project-baseline");
  }

  for (const workflowId of workflowsToCheck) {
    try {
      const workflow = await loadWorkflow(config.agentControlRoot, workflowId, config.projectConfigRoot);
      for (const stage of workflow.stages) {
        if (!(stage.role in config.roles.roles)) {
          errors.push(`Workflow '${workflowId}' references undefined role '${stage.role}'`);
        }
      }
    } catch (error) {
      // Only the default workflow is required; project-baseline is optional.
      if (workflowId === config.manifest.default_workflow) {
        errors.push(`Failed to load workflow '${workflowId}': ${String(error)}`);
      }
    }
  }

  for (const [roleName, roleDefinition] of Object.entries(config.roles.roles)) {
    for (const skillPath of roleDefinition.skills) {
      const absoluteSkillPath = path.join(config.agentControlRoot, skillPath);
      if (!(await pathExists(absoluteSkillPath))) {
        errors.push(`Role '${roleName}' references missing skill file: ${skillPath}`);
      }
    }
  }

  for (const docRootKey of ["technical_doc_root", "review_doc_root", "product_doc_root"] as const) {
    const absoluteDocRoot = normalizeProjectPath(config.repoRoot, config.manifest[docRootKey]);
    if (absoluteDocRoot.startsWith(config.agentControlRoot)) {
      warnings.push(`${docRootKey} points inside helm-agent and will be removed on uninstall: ${config.manifest[docRootKey]}`);
    }
  }

  if (config.manifest.product_doc_required) {
    if (!("product_doc_writer" in config.roles.roles) || !("product_doc_writer" in config.models.roles)) {
      errors.push("product_doc_required=true but product_doc_writer is missing from roles.yaml or models.yaml");
    }

    const enhancementWorkflow = await loadWorkflow(config.agentControlRoot, config.manifest.default_workflow);
    if (!enhancementWorkflow.stages.some((stage) => stage.id === "product_documentation")) {
      errors.push("product_doc_required=true but the default workflow does not include a product_documentation stage");
    }
  }

  for (const filePath of config.manifest.solution_files ?? []) {
    const absolutePath = normalizeProjectPath(config.repoRoot, filePath);
    if (!(await pathExists(absolutePath))) {
      warnings.push(`Configured solution file does not exist yet: ${filePath}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}