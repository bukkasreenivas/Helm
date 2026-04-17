import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanRepository } from "../lib/repo-scan";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("repo-scan", () => {
  it("filters generated docs and ignored roots", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "helm-scan-"));
    tempRoots.push(tempRoot);

    await fs.mkdir(path.join(tempRoot, "docs", "technical"), { recursive: true });
    await fs.mkdir(path.join(tempRoot, "agent-control", "runs"), { recursive: true });
    await fs.mkdir(path.join(tempRoot, "platform"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "README.md"), "# Root");
    await fs.writeFile(path.join(tempRoot, "docs", "technical", "project_overview.md"), "generated");
    await fs.writeFile(path.join(tempRoot, "agent-control", "runs", "artifact.md"), "run");
    await fs.writeFile(path.join(tempRoot, "platform", "service.csproj"), "<Project />");

    const summary = await scanRepository(tempRoot, {
      ignoreRelativeRoots: ["agent-control", "docs/technical"],
    });

    expect(summary.markdownFiles).toEqual(["README.md"]);
    expect(summary.csprojFiles).toEqual(["platform/service.csproj"]);
  });
});