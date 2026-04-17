import path from "node:path";
import { validateProject } from "../lib/validate";

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

  console.log(`Validation passed for ${repoRoot}`);
}