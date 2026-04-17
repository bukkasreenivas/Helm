import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function copyDirectory(source: string, destination: string): Promise<void> {
  await ensureDir(path.dirname(destination));
  await fs.cp(source, destination, { recursive: true, force: true });
}

export async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

export async function listFilesRecursive(rootPath: string, ignoreNames: Set<string>, results: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoreNames.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      await listFilesRecursive(fullPath, ignoreNames, results);
    } else {
      results.push(fullPath);
    }
  }

  return results;
}