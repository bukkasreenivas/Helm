import path from "node:path";
import YAML from "yaml";
import { pathExists, readTextFile, writeTextFile } from "./fs-utils";
import { resolveAgentControlRoot, resolveLegacyAgentRoot, resolveManifestPath, resolveModelsPath, resolvePackRoot, resolveRolesPath } from "./paths";
import type { LoadedProjectConfig, ManifestConfig, ModelsConfig, RolesConfig, WorkflowConfig } from "./types";

export async function loadYamlFile<T>(filePath: string): Promise<T> {
  const raw = await readTextFile(filePath);
  return YAML.parse(raw) as T;
}

export async function writeYamlFile(filePath: string, data: unknown): Promise<void> {
  const serialized = YAML.stringify(data, { indent: 2 });
  await writeTextFile(filePath, serialized);
}

async function maybeLoadYaml<T>(filePath: string): Promise<T | undefined> {
  if (!(await pathExists(filePath))) return undefined;
  return loadYamlFile<T>(filePath);
}

/** Resolve the project's helm-agent/ directory, supporting the legacy agent-control/ name. */
async function resolveProjectConfigRoot(repoRoot: string): Promise<string> {
  const preferred = resolveAgentControlRoot(repoRoot);
  if (await pathExists(preferred)) return preferred;
  const legacy = resolveLegacyAgentRoot(repoRoot);
  if (await pathExists(legacy)) return legacy;
  return preferred;
}

export async function loadProjectConfig(repoRoot: string): Promise<LoadedProjectConfig> {
  const projectConfigRoot = await resolveProjectConfigRoot(repoRoot);
  const manifest = await loadYamlFile<ManifestConfig>(resolveManifestPath(projectConfigRoot));
  const packName = manifest.pack_name ?? "default";

  // Pack root is always inside the Helm tool — source of skills, workflows, templates.
  const agentControlRoot = resolvePackRoot(packName);

  // models.yaml and roles.yaml: project file takes precedence, pack default is the fallback.
  const models =
    (await maybeLoadYaml<ModelsConfig>(resolveModelsPath(projectConfigRoot))) ??
    (await loadYamlFile<ModelsConfig>(resolveModelsPath(agentControlRoot)));
  const roles =
    (await maybeLoadYaml<RolesConfig>(resolveRolesPath(projectConfigRoot))) ??
    (await loadYamlFile<RolesConfig>(resolveRolesPath(agentControlRoot)));

  return { repoRoot, agentControlRoot, projectConfigRoot, manifest, models, roles };
}

/**
 * Load a workflow definition.
 * Project's helm-agent/workflows/ takes precedence over the pack — allows per-project overrides.
 */
export async function loadWorkflow(agentControlRoot: string, workflowId: string, projectConfigRoot?: string): Promise<WorkflowConfig> {
  if (projectConfigRoot) {
    const projectWorkflowPath = path.join(projectConfigRoot, "workflows", `${workflowId}.yaml`);
    if (await pathExists(projectWorkflowPath)) {
      return loadYamlFile<WorkflowConfig>(projectWorkflowPath);
    }
  }
  const workflowPath = path.join(agentControlRoot, "workflows", `${workflowId}.yaml`);
  return loadYamlFile<WorkflowConfig>(workflowPath);
}
