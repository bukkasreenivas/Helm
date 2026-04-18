import path from "node:path";
import { validateProject } from "../lib/validate";
import { loadProjectConfig } from "../lib/yaml-config";
import pkg from "../../package.json";

export async function validateAgent(target: string): Promise<void> {
  const repoRoot = path.resolve(target);
  const result = await validateProject(repoRoot);

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (!result.ok) {
    console.error("Validation failed:");
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    throw new Error("validate-agent failed");
  }

  const config = await loadProjectConfig(repoRoot);
  const installedVersion = config.manifest.helm_version ?? "unknown (pre-versioning)";
  const upToDate = installedVersion === pkg.version;
  console.log(`Validation passed for ${repoRoot}`);
  console.log(`  Pack: ${config.manifest.pack_name ?? "default"} | Installed: Helm ${installedVersion} | Current: Helm ${pkg.version}${upToDate ? "" : " ← run update-agent"}`);
}