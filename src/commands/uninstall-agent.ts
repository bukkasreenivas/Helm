import fs from "node:fs/promises";
import path from "node:path";
import { pathExists } from "../lib/fs-utils";
import { loadYamlFile, resolveInstalledAgentRoot } from "../lib/yaml-config";
import type { ManifestConfig } from "../lib/types";

export async function uninstallAgent(target: string, options: { purgeRuns?: boolean }): Promise<void> {
  const repoRoot = path.resolve(target);
  const agentControlRoot = await resolveInstalledAgentRoot(repoRoot);

  if (!(await pathExists(agentControlRoot))) {
    throw new Error(`Cannot uninstall because helm-agent does not exist in ${repoRoot}`);
  }

  let runArtifactRoot: string | undefined;
  const manifestPath = path.join(agentControlRoot, "manifest.yaml");
  if (await pathExists(manifestPath)) {
    const manifest = await loadYamlFile<ManifestConfig>(manifestPath);
    runArtifactRoot = manifest.run_artifact_root;
  }

  await fs.rm(agentControlRoot, { recursive: true, force: true });

  if (options.purgeRuns && runArtifactRoot) {
    const absoluteRunRoot = path.isAbsolute(runArtifactRoot) ? runArtifactRoot : path.join(repoRoot, runArtifactRoot);
    await fs.rm(absoluteRunRoot, { recursive: true, force: true });
  }

  console.log(`Uninstalled Helm agent from ${repoRoot}`);
  if (!options.purgeRuns) {
    console.log("Durable docs were left in place. Use --purge-runs to also delete run artifacts.");
  }
}