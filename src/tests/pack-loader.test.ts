import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installAgent } from "../commands/install-agent";
import { composePackConfig, resolvePackChain } from "../lib/pack-loader";
import { loadYamlFile } from "../lib/yaml-config";
import type { ManifestConfig, ModelsConfig } from "../lib/types";

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

  it("install creates only the three config files — no skills or workflows copied", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "helm-install-"));
    tempRoots.push(tempRoot);
    const repoRoot = path.join(tempRoot, "repo");
    await fs.mkdir(repoRoot, { recursive: true });

    await installAgent(repoRoot, { pack: "default" });

    const agentRoot = path.join(repoRoot, "helm-agent");

    // Config files must exist
    await expect(fs.access(path.join(agentRoot, "manifest.yaml"))).resolves.not.toThrow();
    await expect(fs.access(path.join(agentRoot, "models.yaml"))).resolves.not.toThrow();
    await expect(fs.access(path.join(agentRoot, "roles.yaml"))).resolves.not.toThrow();

    // Skills and workflows must NOT be copied — they live in the Helm tool
    await expect(fs.access(path.join(agentRoot, "skills"))).rejects.toThrow();
    await expect(fs.access(path.join(agentRoot, "workflows"))).rejects.toThrow();

    const manifest = await loadYamlFile<ManifestConfig>(path.join(agentRoot, "manifest.yaml"));
    expect(manifest.root_path).toBe(repoRoot);
    expect(manifest.pack_name).toBe("default");
    expect(manifest.helm_version).toBeDefined();
  });

  it("install --force reinitialises an existing project without error", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "helm-install-"));
    tempRoots.push(tempRoot);
    const repoRoot = path.join(tempRoot, "repo");
    await fs.mkdir(repoRoot, { recursive: true });

    await installAgent(repoRoot, { pack: "default" });

    // Customise models.yaml
    const modelsPath = path.join(repoRoot, "helm-agent", "models.yaml");
    const models = await loadYamlFile<ModelsConfig>(modelsPath);
    models.roles.architect = "gpt-5.4";
    const { writeYamlFile } = await import("../lib/yaml-config");
    await writeYamlFile(modelsPath, models);

    // Re-install with --force should succeed and reset config to defaults
    await expect(installAgent(repoRoot, { pack: "default", force: true })).resolves.not.toThrow();

    const resetModels = await loadYamlFile<ModelsConfig>(modelsPath);
    // After force re-install, models are back to pack defaults
    expect(resetModels.roles.architect).not.toBe("gpt-5.4");
  });
});
