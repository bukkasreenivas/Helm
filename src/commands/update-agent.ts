import fs from "node:fs/promises";
import path from "node:path";
import { copyDirectory, pathExists } from "../lib/fs-utils";
import { resolveAgentControlRoot, resolvePackRoot } from "../lib/paths";
import { validateProject } from "../lib/validate";

export async function updateAgent(target: string): Promise<void> {
  const repoRoot = path.resolve(target);
  const agentControlRoot = resolveAgentControlRoot(repoRoot);
  const packRoot = resolvePackRoot();
  const backupRoot = path.join(repoRoot, ".helm-update-backup");

  if (!(await pathExists(agentControlRoot))) {
    throw new Error(`Cannot update because agent-control does not exist in ${repoRoot}`);
  }

  await fs.rm(backupRoot, { recursive: true, force: true });
  await copyDirectory(agentControlRoot, backupRoot);

  try {
    for (const relativePath of ["workflows", "skills", "templates", "scripts", "README.md", "VERSION"]) {
      await copyDirectory(path.join(packRoot, relativePath), path.join(agentControlRoot, relativePath));
    }

    const validation = await validateProject(repoRoot);
    if (!validation.ok) {
      throw new Error(validation.errors.join("\n"));
    }

    console.log(`Updated Helm agent pack in ${agentControlRoot}`);
  } catch (error) {
    await fs.rm(agentControlRoot, { recursive: true, force: true });
    await copyDirectory(backupRoot, agentControlRoot);
    throw new Error(`Update failed and was rolled back: ${String(error)}`);
  } finally {
    await fs.rm(backupRoot, { recursive: true, force: true });
  }
}