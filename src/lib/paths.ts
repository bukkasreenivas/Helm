import path from "node:path";

export function resolvePackRoot(): string {
  return path.resolve(__dirname, "..", "..", "packs", "default");
}

export function resolveAgentControlRoot(repoRoot: string): string {
  return path.join(repoRoot, "agent-control");
}

export function resolveManifestPath(agentControlRoot: string): string {
  return path.join(agentControlRoot, "manifest.yaml");
}

export function resolveModelsPath(agentControlRoot: string): string {
  return path.join(agentControlRoot, "models.yaml");
}

export function resolveRolesPath(agentControlRoot: string): string {
  return path.join(agentControlRoot, "roles.yaml");
}

export function normalizeProjectPath(repoRoot: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}