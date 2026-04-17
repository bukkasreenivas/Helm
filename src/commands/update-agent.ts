import fs from "node:fs/promises";
import path from "node:path";
import { copyDirectory, pathExists } from "../lib/fs-utils";
import { resolveAgentControlRoot } from "../lib/paths";
import { deepMerge } from "../lib/deep-merge";
import { loadYamlFile, writeYamlFile } from "../lib/yaml-config";
import { materializePack } from "../lib/pack-loader";
import type { ManifestConfig, ModelsConfig, RolesConfig } from "../lib/types";
import { validateProject } from "../lib/validate";

async function loadInstalledConfigs(agentControlRoot: string): Promise<{
  manifest: ManifestConfig;
  models: ModelsConfig;
  roles: RolesConfig;
}> {
  return {
    manifest: await loadYamlFile<ManifestConfig>(path.join(agentControlRoot, "manifest.yaml")),
    models: await loadYamlFile<ModelsConfig>(path.join(agentControlRoot, "models.yaml")),
    roles: await loadYamlFile<RolesConfig>(path.join(agentControlRoot, "roles.yaml")),
  };
}

export async function updateAgent(target: string): Promise<void> {
  const repoRoot = path.resolve(target);
  const agentControlRoot = resolveAgentControlRoot(repoRoot);
  const backupRoot = path.join(repoRoot, ".helm-update-backup");

  if (!(await pathExists(agentControlRoot))) {
    throw new Error(`Cannot update because agent-control does not exist in ${repoRoot}`);
  }

  const installedConfig = await loadInstalledConfigs(agentControlRoot);
  const packName = installedConfig.manifest.pack_name ?? "default";

  await fs.rm(backupRoot, { recursive: true, force: true });
  await copyDirectory(agentControlRoot, backupRoot);

  try {
    await materializePack(packName, agentControlRoot);

    const updatedPackConfig = await loadInstalledConfigs(agentControlRoot);
    const mergedManifest = deepMerge(updatedPackConfig.manifest, installedConfig.manifest);
    const mergedModels = deepMerge(updatedPackConfig.models, installedConfig.models);
    const mergedRoles = deepMerge(updatedPackConfig.roles, installedConfig.roles);
    mergedManifest.pack_name = packName;

    await writeYamlFile(path.join(agentControlRoot, "manifest.yaml"), mergedManifest);
    await writeYamlFile(path.join(agentControlRoot, "models.yaml"), mergedModels);
    await writeYamlFile(path.join(agentControlRoot, "roles.yaml"), mergedRoles);

    const validation = await validateProject(repoRoot);
    if (!validation.ok) {
      throw new Error(validation.errors.join("\n"));
    }

    console.log(`Updated Helm agent pack '${packName}' in ${agentControlRoot}`);
  } catch (error) {
    await fs.rm(agentControlRoot, { recursive: true, force: true });
    await copyDirectory(backupRoot, agentControlRoot);
    throw new Error(`Update failed and was rolled back: ${String(error)}`);
  } finally {
    await fs.rm(backupRoot, { recursive: true, force: true });
  }
}