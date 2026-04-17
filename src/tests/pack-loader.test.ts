import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { updateAgent } from "../commands/update-agent";
import { composePackConfig, materializePack, resolvePackChain } from "../lib/pack-loader";
import { loadYamlFile, writeYamlFile } from "../lib/yaml-config";
import type { ManifestConfig, RolesConfig } from "../lib/types";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("pack-loader", () => {
  it("resolves inherited pack chains", async () => {
    await expect(resolvePackChain("webapp")).resolves.toEqual(["default", "webapp"]);
  });

  it("composes manifest overrides from child pack", async () => {
    const composed = await composePackConfig("webapp");
    expect(composed.manifest.project_id).toBe("sample-webapp");
    expect(composed.manifest.cross_solution_changes_expected).toBe(true);
    expect(composed.manifest.pack_name).toBe("webapp");
    expect(composed.models.roles.architect).toBe("sonnet-4.6");
  });

  it("materializes merged config and override skills", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "helm-pack-"));
    tempRoots.push(tempRoot);
    const destination = path.join(tempRoot, "agent-control");

    await materializePack("webapp", destination);

    const manifest = await loadYamlFile<ManifestConfig>(path.join(destination, "manifest.yaml"));
    const roles = await loadYamlFile<RolesConfig>(path.join(destination, "roles.yaml"));

    expect(manifest.project_name).toBe("Sample Web Application");
    expect(manifest.pack_name).toBe("webapp");
    expect(roles.roles.architect.skills).toContain("skills/webapp-delivery-context.md");
  });

  it("preserves installed config overrides during update", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "helm-update-"));
    tempRoots.push(tempRoot);
    const repoRoot = path.join(tempRoot, "repo");
    const agentControlRoot = path.join(repoRoot, "agent-control");

    await fs.mkdir(repoRoot, { recursive: true });
    await materializePack("default", agentControlRoot);

    const manifestPath = path.join(agentControlRoot, "manifest.yaml");
    const modelsPath = path.join(agentControlRoot, "models.yaml");

    const manifest = await loadYamlFile<ManifestConfig>(manifestPath);
    manifest.root_path = repoRoot;
    manifest.project_id = "custom-project";
    manifest.project_name = "Custom Project";
    manifest.pack_name = "default";
    await writeYamlFile(manifestPath, manifest);

    const models = await loadYamlFile<{ schema_version: number; roles: Record<string, string>; fallbacks?: Record<string, string> }>(modelsPath);
    models.roles.architect = "gpt-5.4";
    await writeYamlFile(modelsPath, models);

    await updateAgent(repoRoot);

    const updatedManifest = await loadYamlFile<ManifestConfig>(manifestPath);
    const updatedModels = await loadYamlFile<{ schema_version: number; roles: Record<string, string> }>(modelsPath);

    expect(updatedManifest.project_id).toBe("custom-project");
    expect(updatedManifest.project_name).toBe("Custom Project");
    expect(updatedManifest.root_path).toBe(repoRoot);
    expect(updatedManifest.pack_name).toBe("default");
    expect(updatedModels.roles.architect).toBe("gpt-5.4");
  });
});