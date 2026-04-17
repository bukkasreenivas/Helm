import path from "node:path";
import { listFilesRecursive } from "./fs-utils";

const IGNORED_NAMES = new Set([".git", "node_modules", "dist", "bin", "obj", ".next"]);

export interface RepoScanOptions {
  ignoreRelativeRoots?: string[];
}

export interface RepoScanSummary {
  topLevelEntries: string[];
  solutionFiles: string[];
  csprojFiles: string[];
  packageJsonFiles: string[];
  dockerFiles: string[];
  markdownFiles: string[];
}

export async function scanRepository(repoRoot: string, options: RepoScanOptions = {}): Promise<RepoScanSummary> {
  const files = await listFilesRecursive(repoRoot, IGNORED_NAMES);
  const toRelative = (filePath: string) => path.relative(repoRoot, filePath).replace(/\\/g, "/");
  const ignoredRoots = (options.ignoreRelativeRoots ?? []).map((entry) => entry.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, ""));
  const relativeFiles = files
    .map(toRelative)
    .filter((file) => !ignoredRoots.some((ignoredRoot) => file === ignoredRoot || file.startsWith(`${ignoredRoot}/`)));
  const topLevelEntries = Array.from(new Set(relativeFiles.map((file) => file.split("/")[0]))).sort();

  return {
    topLevelEntries,
    solutionFiles: relativeFiles.filter((file) => file.endsWith(".sln") || file.endsWith(".code-workspace")),
    csprojFiles: relativeFiles.filter((file) => file.endsWith(".csproj")),
    packageJsonFiles: relativeFiles.filter((file) => file.endsWith("package.json")),
    dockerFiles: relativeFiles.filter((file) => /(^|\/)Dockerfile(\.|$)?/.test(file) || file.endsWith("docker-compose.yml") || file.endsWith("docker-compose.dev.yml")),
    markdownFiles: relativeFiles
      .filter((file) => file.endsWith(".md"))
      .filter((file) => !/^docs\/(technical|code-review|product)\//.test(file))
      .slice(0, 50),
  };
}