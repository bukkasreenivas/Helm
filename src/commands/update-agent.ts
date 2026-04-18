import fs from "node:fs/promises";
import path from "node:path";
import pkg from "../../package.json";
import { copyDirectory, pathExists } from "../lib/fs-utils";
import { resolveAgentControlRoot } from "../lib/paths";
import { deepMerge } from "../lib/deep-merge";
import { loadYamlFile, resolveInstalledAgentRoot, writeYamlFile } from "../lib/yaml-config";
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
  const installedRoot = await resolveInstalledAgentRoot(repoRoot);
  const agentControlRoot = resolveAgentControlRoot(repoRoot);
  const backupRoot = path.join(repoRoot, ".helm-update-backup");

  if (!(await pathExists(installedRoot))) {
    throw new Error(`Cannot update because helm-agent does not exist in ${repoRoot}`);
  }

  const installedConfig = await loadInstalledConfigs(installedRoot);
  const packName = installedConfig.manifest.pack_name ?? "default";
  const fromVersion = installedConfig.manifest.helm_version ?? "unknown";
  console.log(`Updating pack '${packName}' from Helm ${fromVersion} → ${pkg.version}`);

  // Warn if workflows or skills have been modified locally — they will be replaced.
  for (const dir of ["workflows", "skills"]) {
    const dirPath = path.join(installedRoot, dir);
    if (await pathExists(dirPath)) {
      const files = await fs.readdir(dirPath);
      if (files.length > 0) {
        console.log(`  Note: ${dir}/ will be replaced with pack defaults. Any local edits to helm-agent/${dir}/ will be lost.`);
      }
    }
  }

  await fs.rm(backupRoot, { recursive: true, force: true });
  await copyDirectory(installedRoot, backupRoot);

  try {
    if (installedRoot !== agentControlRoot) {
      await fs.rm(agentControlRoot, { recursive: true, force: true });
    }
    await materializePack(packName, agentControlRoot);

    const updatedPackConfig = await loadInstalledConfigs(agentControlRoot);
    const mergedManifest = deepMerge(updatedPackConfig.manifest, installedConfig.manifest);
    const mergedModels = deepMerge(updatedPackConfig.models, installedConfig.models);
    const mergedRoles = deepMerge(updatedPackConfig.roles, installedConfig.roles);
    mergedManifest.pack_name = packName;
    mergedManifest.helm_version = pkg.version;
    if (mergedManifest.run_artifact_root === "agent-control/runs") {
      mergedManifest.run_artifact_root = "helm-agent/runs";
    }

    await writeYamlFile(path.join(agentControlRoot, "manifest.yaml"), mergedManifest);
    await writeYamlFile(path.join(agentControlRoot, "models.yaml"), mergedModels);
    await writeYamlFile(path.join(agentControlRoot, "roles.yaml"), mergedRoles);

    if (installedRoot !== agentControlRoot) {
      await fs.rm(installedRoot, { recursive: true, force: true });
    }

    const validation = await validateProject(repoRoot);
    if (!validation.ok) {
      throw new Error(validation.errors.join("\n"));
    }

    console.log(`Updated Helm agent pack '${packName}' in ${agentControlRoot}`);
  } catch (error) {
    await fs.rm(agentControlRoot, { recursive: true, force: true });
    await copyDirectory(backupRoot, installedRoot);
    throw new Error(`Update failed and was rolled back: ${String(error)}`);
  } finally {
    await fs.rm(backupRoot, { recursive: true, force: true });
  }
}