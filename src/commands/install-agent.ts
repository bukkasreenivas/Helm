import path from "node:path";
import { ensureDir, pathExists } from "../lib/fs-utils";
import { resolveAgentControlRoot, normalizeProjectPath } from "../lib/paths";
import { materializePack } from "../lib/pack-loader";
import { validateProject } from "../lib/validate";
import { loadYamlFile, writeYamlFile } from "../lib/yaml-config";
import type { ManifestConfig } from "../lib/types";
import { runWorkflow } from "./run-workflow";

export async function installAgent(target: string, options: { force?: boolean; runBaseline?: boolean; pack?: string }): Promise<void> {
  const repoRoot = path.resolve(target);
  const agentControlRoot = resolveAgentControlRoot(repoRoot);
  const packName = options.pack ?? "default";

  if (await pathExists(agentControlRoot)) {
    if (!options.force) {
      throw new Error(`agent-control already exists at ${agentControlRoot}. Use --force to overwrite.`);
    }
  }

  await materializePack(packName, agentControlRoot);

  const manifestPath = path.join(agentControlRoot, "manifest.yaml");
  const manifest = await loadYamlFile<ManifestConfig>(manifestPath);
  manifest.root_path = repoRoot;
  manifest.pack_name = packName;
  await writeYamlFile(manifestPath, manifest);

  await ensureDir(normalizeProjectPath(repoRoot, manifest.technical_doc_root));
  await ensureDir(normalizeProjectPath(repoRoot, manifest.review_doc_root));
  await ensureDir(normalizeProjectPath(repoRoot, manifest.product_doc_root));
  await ensureDir(normalizeProjectPath(repoRoot, manifest.run_artifact_root));

  const validation = await validateProject(repoRoot);
  if (!validation.ok) {
    throw new Error(`Validation failed after install:\n${validation.errors.join("\n")}`);
  }

  console.log(`Installed Helm agent pack '${packName}' into ${agentControlRoot}`);
  if (validation.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of validation.warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (options.runBaseline) {
    await runWorkflow(repoRoot, {
      workflow: "project-baseline",
      feature: "baseline",
      skipValidate: true,
      dryRun: false,
    });
  }
}