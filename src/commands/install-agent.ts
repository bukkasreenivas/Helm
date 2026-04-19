import path from "node:path";
import { ensureDir, pathExists } from "../lib/fs-utils";
import { resolveAgentControlRoot, resolveLegacyAgentRoot, normalizeProjectPath, HELM_AGENT_DIR_NAME, LEGACY_AGENT_DIR_NAME } from "../lib/paths";
import { composePackConfig } from "../lib/pack-loader";
import { validateProject } from "../lib/validate";
import { writeYamlFile } from "../lib/yaml-config";
import { runWorkflow } from "./run-workflow";
import pkg from "../../package.json";

export async function installAgent(target: string, options: { force?: boolean; runBaseline?: boolean; pack?: string }): Promise<void> {
  const repoRoot = path.resolve(target);
  const agentControlRoot = resolveAgentControlRoot(repoRoot);
  const legacyAgentRoot = resolveLegacyAgentRoot(repoRoot);
  const packName = options.pack ?? "default";

  const existingPreferred = await pathExists(agentControlRoot);
  const existingLegacy = await pathExists(legacyAgentRoot);
  if ((existingPreferred || existingLegacy) && !options.force) {
    const existingRoot = existingPreferred ? agentControlRoot : legacyAgentRoot;
    throw new Error(`${HELM_AGENT_DIR_NAME} already exists at ${existingRoot}. Use --force to reinitialise.`);
  }

  await ensureDir(agentControlRoot);

  // Write only the three project-specific config files.
  // Skills, workflows, and templates are read directly from the Helm tool at runtime.
  const composed = await composePackConfig(packName);
  composed.manifest.root_path = repoRoot;
  composed.manifest.pack_name = packName;
  composed.manifest.helm_version = pkg.version;

  await writeYamlFile(path.join(agentControlRoot, "manifest.yaml"), composed.manifest);
  await writeYamlFile(path.join(agentControlRoot, "models.yaml"), composed.models);
  await writeYamlFile(path.join(agentControlRoot, "roles.yaml"), composed.roles);

  await ensureDir(normalizeProjectPath(repoRoot, composed.manifest.technical_doc_root));
  await ensureDir(normalizeProjectPath(repoRoot, composed.manifest.review_doc_root));
  await ensureDir(normalizeProjectPath(repoRoot, composed.manifest.product_doc_root));
  await ensureDir(normalizeProjectPath(repoRoot, composed.manifest.run_artifact_root));

  const validation = await validateProject(repoRoot);
  if (!validation.ok) {
    throw new Error(`Validation failed after install:\n${validation.errors.join("\n")}`);
  }

  console.log(`Installed Helm agent (pack: ${packName}, version: ${pkg.version}) into ${agentControlRoot}`);
  console.log(`  Edit helm-agent/manifest.yaml to configure your project (test commands, important files, etc.)`);
  if (validation.warnings.length > 0) {
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
