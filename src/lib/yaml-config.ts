import path from "node:path";
import YAML from "yaml";
import { readTextFile, writeTextFile } from "./fs-utils";
import { resolveAgentControlRoot, resolveManifestPath, resolveModelsPath, resolveRolesPath } from "./paths";
import type { LoadedProjectConfig, ManifestConfig, ModelsConfig, RolesConfig, WorkflowConfig } from "./types";

export async function loadYamlFile<T>(filePath: string): Promise<T> {
  const raw = await readTextFile(filePath);
  return YAML.parse(raw) as T;
}

export async function writeYamlFile(filePath: string, data: unknown): Promise<void> {
  const serialized = YAML.stringify(data, { indent: 2 });
  await writeTextFile(filePath, serialized);
}

export async function loadProjectConfig(repoRoot: string): Promise<LoadedProjectConfig> {
  const agentControlRoot = resolveAgentControlRoot(repoRoot);
  const manifest = await loadYamlFile<ManifestConfig>(resolveManifestPath(agentControlRoot));
  const models = await loadYamlFile<ModelsConfig>(resolveModelsPath(agentControlRoot));
  const roles = await loadYamlFile<RolesConfig>(resolveRolesPath(agentControlRoot));

  return {
    repoRoot,
    agentControlRoot,
    manifest,
    models,
    roles,
  };
}

export async function loadWorkflow(agentControlRoot: string, workflowId: string): Promise<WorkflowConfig> {
  const workflowPath = path.join(agentControlRoot, "workflows", `${workflowId}.yaml`);
  return loadYamlFile<WorkflowConfig>(workflowPath);
}