import path from "node:path";
import { pathExists, copyDirectory } from "./fs-utils";
import { resolvePackRoot } from "./paths";
import { deepMerge } from "./deep-merge";
import { loadYamlFile, writeYamlFile } from "./yaml-config";
import type { ManifestConfig, ModelsConfig, PackDefinition, RolesConfig } from "./types";

async function loadPackDefinition(packName: string): Promise<PackDefinition> {
  const definitionPath = path.join(resolvePackRoot(packName), "pack.yaml");
  if (await pathExists(definitionPath)) {
    return loadYamlFile<PackDefinition>(definitionPath);
  }

  return { name: packName };
}

export async function resolvePackChain(packName: string): Promise<string[]> {
  const chain: string[] = [];
  const visited = new Set<string>();
  let current = packName;

  while (current) {
    if (visited.has(current)) {
      throw new Error(`Circular pack inheritance detected: ${[...chain, current].join(" -> ")}`);
    }
    visited.add(current);
    chain.unshift(current);
    const definition = await loadPackDefinition(current);
    current = definition.extends ?? "";
  }

  return chain;
}

async function maybeLoadYaml<T>(filePath: string): Promise<T | undefined> {
  if (!(await pathExists(filePath))) {
    return undefined;
  }

  return loadYamlFile<T>(filePath);
}

export async function composePackConfig(packName: string): Promise<{ manifest: ManifestConfig; models: ModelsConfig; roles: RolesConfig }> {
  const chain = await resolvePackChain(packName);
  let manifest: ManifestConfig | undefined;
  let models: ModelsConfig | undefined;
  let roles: RolesConfig | undefined;

  for (const currentName of chain) {
    const packRoot = resolvePackRoot(currentName);
    const nextManifest = await maybeLoadYaml<ManifestConfig>(path.join(packRoot, "manifest.yaml"));
    const nextModels = await maybeLoadYaml<ModelsConfig>(path.join(packRoot, "models.yaml"));
    const nextRoles = await maybeLoadYaml<RolesConfig>(path.join(packRoot, "roles.yaml"));

    if (nextManifest) {
      manifest = manifest ? deepMerge(manifest, nextManifest) : nextManifest;
    }
    if (nextModels) {
      models = models ? deepMerge(models, nextModels) : nextModels;
    }
    if (nextRoles) {
      roles = roles ? deepMerge(roles, nextRoles) : nextRoles;
    }
  }

  if (!manifest || !models || !roles) {
    throw new Error(`Pack '${packName}' is missing manifest.yaml, models.yaml, or roles.yaml`);
  }

  manifest.pack_name = packName;
  return { manifest, models, roles };
}

export async function materializePack(packName: string, destinationRoot: string): Promise<void> {
  const chain = await resolvePackChain(packName);
  await copyDirectory(resolvePackRoot(chain[0]), destinationRoot);

  const composed = await composePackConfig(packName);
  await writeYamlFile(path.join(destinationRoot, "manifest.yaml"), composed.manifest);
  await writeYamlFile(path.join(destinationRoot, "models.yaml"), composed.models);
  await writeYamlFile(path.join(destinationRoot, "roles.yaml"), composed.roles);

  for (const currentName of chain.slice(1)) {
    const packRoot = resolvePackRoot(currentName);
    for (const relativePath of ["workflows", "skills", "templates", "scripts", "README.md", "VERSION"]) {
      const source = path.join(packRoot, relativePath);
      if (await pathExists(source)) {
        await copyDirectory(source, path.join(destinationRoot, relativePath));
      }
    }
  }
}