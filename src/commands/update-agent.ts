import path from "node:path";
import { resolveAgentControlRoot } from "../lib/paths";
import { loadYamlFile } from "../lib/yaml-config";
import { resolveManifestPath } from "../lib/paths";
import type { ManifestConfig } from "../lib/types";
import pkg from "../../package.json";

/**
 * Skills, workflows, and templates are read directly from the Helm tool at runtime —
 * there is nothing to copy or migrate per-project. Updating the Helm CLI or VS Code
 * extension automatically upgrades all projects.
 *
 * This command reports the current state and reminds the user what to do.
 */
export async function updateAgent(target: string): Promise<void> {
  const repoRoot = path.resolve(target);
  const agentControlRoot = resolveAgentControlRoot(repoRoot);
  const manifestPath = resolveManifestPath(agentControlRoot);

  let installedVersion = "unknown";
  let packName = "default";
  try {
    const manifest = await loadYamlFile<ManifestConfig>(manifestPath);
    installedVersion = manifest.helm_version ?? "unknown (pre-versioning)";
    packName = manifest.pack_name ?? "default";
  } catch {
    throw new Error(`No helm-agent found in ${repoRoot}. Run install-agent first.`);
  }

  const upToDate = installedVersion === pkg.version;
  console.log(`Pack: ${packName} | Installed: Helm ${installedVersion} | Current: Helm ${pkg.version}`);

  if (upToDate) {
    console.log(`Up to date. Skills, workflows, and templates are always read from the installed Helm tool — no per-project update needed.`);
  } else {
    console.log(`Helm tool has been upgraded. Skills and workflows now reflect version ${pkg.version} automatically.`);
    console.log(`To record the new version in this project's manifest, run: helm install-agent --target ${repoRoot} --force`);
  }
}
