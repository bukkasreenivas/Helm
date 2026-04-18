import path from "node:path";
import { getArtifactTemplate } from "./template-map";
import { readTextFile, pathExists } from "./fs-utils";
import { HELM_AGENT_DIR_NAME, LEGACY_AGENT_DIR_NAME, normalizeProjectPath } from "./paths";
import { scanRepository } from "./repo-scan";
import type { LoadedProjectConfig, WorkflowConfig, WorkflowStage } from "./types";

function trimContent(label: string, content: string, maxChars = 12000): string {
  const normalized = content.trim();
  if (normalized.length <= maxChars) {
    return `## ${label}\n${normalized}`;
  }

  return `## ${label}\n${normalized.slice(0, maxChars)}\n\n[truncated]`;
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  if (!(await pathExists(filePath))) {
    return undefined;
  }

  return readTextFile(filePath);
}

async function gatherProjectContext(config: LoadedProjectConfig): Promise<string[]> {
  const sections: string[] = [];
  for (const relativePath of config.manifest.important_files ?? []) {
    const absolutePath = normalizeProjectPath(config.repoRoot, relativePath);
    const content = await readOptionalFile(absolutePath);
    if (content) {
      sections.push(trimContent(`Important File: ${relativePath}`, content));
    }
  }

  for (const relativePath of config.manifest.optional_supplements ?? []) {
    const absolutePath = normalizeProjectPath(config.repoRoot, relativePath);
    const content = await readOptionalFile(absolutePath);
    if (content) {
      sections.push(trimContent(`Supplement: ${relativePath}`, content, 8000));
    }
  }

  return sections;
}

async function gatherSkillContent(config: LoadedProjectConfig, stage: WorkflowStage): Promise<string[]> {
  const roleDefinition = config.roles.roles[stage.role];
  const sections: string[] = [];
  for (const skillPath of roleDefinition?.skills ?? []) {
    const absoluteSkillPath = path.join(config.agentControlRoot, skillPath);
    const content = await readOptionalFile(absoluteSkillPath);
    if (content) {
      sections.push(trimContent(`Skill: ${skillPath}`, content, 6000));
    }
  }

  return sections;
}

async function gatherTemplateGuidance(config: LoadedProjectConfig, stage: WorkflowStage): Promise<string[]> {
  const sections: string[] = [];
  for (const artifact of stage.required_artifacts ?? []) {
    const template = getArtifactTemplate(artifact);
    sections.push(`ARTIFACT_ID: ${artifact}\nARTIFACT_DESCRIPTION: ${template.description}`);
    if (template.templatePath) {
      const content = await readOptionalFile(path.join(config.agentControlRoot, template.templatePath));
      if (content) {
        sections.push(trimContent(`Template: ${template.templatePath}`, content, 6000));
      }
    }
  }

  return sections;
}

async function gatherBaselineSummary(config: LoadedProjectConfig, workflow: WorkflowConfig): Promise<string[]> {
  if (workflow.workflow_id !== "project-baseline") {
    return [];
  }

  const summary = await scanRepository(config.repoRoot, {
    ignoreRelativeRoots: [HELM_AGENT_DIR_NAME, LEGACY_AGENT_DIR_NAME, config.manifest.run_artifact_root, config.manifest.technical_doc_root, config.manifest.review_doc_root, config.manifest.product_doc_root],
  });

  return [
    trimContent(
      "Repository Scan Summary",
      JSON.stringify(summary, null, 2),
      12000,
    ),
  ];
}

export async function buildPrompts(
  config: LoadedProjectConfig,
  workflow: WorkflowConfig,
  stage: WorkflowStage,
  feature: string,
  priorArtifactContents: string[],
): Promise<{ systemPrompt: string; userPrompt: string }> {
  const projectSections = await gatherProjectContext(config);
  const skillSections = await gatherSkillContent(config, stage);
  const templateSections = await gatherTemplateGuidance(config, stage);
  const baselineSections = await gatherBaselineSummary(config, workflow);

  const systemPrompt = [
    "You are Helm, a structured software delivery workflow agent.",
    `Current workflow: ${workflow.workflow_id}`,
    `Current stage: ${stage.id}`,
    `Current role: ${stage.role}`,
    "CRITICAL: Return ONLY valid JSON. All string values must have newlines escaped as \\n. Do NOT include raw line breaks inside JSON string values. Shape:",
    '{"summary":"short markdown summary","artifacts":{"artifact-id":"markdown content"},"project_files":{"relative/path/to/file.ts":"file content"}}',
    "If a stage has no required artifacts, return an empty artifacts object.",
    "Artifacts must be complete, production-ready markdown, not notes or placeholders.",
    "Use project_files to write actual source or test files into the project. Keys are paths relative to the repo root. Values are complete file contents.",
    "If your role does not write code files, omit project_files or return an empty object.",
  ].join("\n");

  const userPrompt = [
    `Feature or domain: ${feature}`,
    `Project: ${config.manifest.project_name}`,
    `Repo root: ${config.manifest.root_path}`,
    `Model role mapping for this stage: ${config.models.roles[stage.role] ?? "unassigned"}`,
    "",
    ...projectSections,
    ...baselineSections,
    ...skillSections,
    ...templateSections,
    ...priorArtifactContents,
    "",
    `Stage success criteria:\n${(stage.success_criteria ?? []).map((item) => `- ${item}`).join("\n")}`,
  ].join("\n\n");

  return { systemPrompt, userPrompt };
}