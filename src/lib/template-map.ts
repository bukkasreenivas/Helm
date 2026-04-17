import path from "node:path";
import type { PromptArtifactTemplate } from "./types";

const TEMPLATE_MAP: Record<string, PromptArtifactTemplate> = {
  architecture: {
    artifact: "architecture",
    templatePath: path.join("templates", "architecture.md"),
    description: "Technical architecture plan",
  },
  "code-review": {
    artifact: "code-review",
    templatePath: path.join("templates", "code-review.md"),
    description: "Findings-first review document",
  },
  "backend-test-report": {
    artifact: "backend-test-report",
    templatePath: path.join("templates", "test-report.md"),
    description: "Backend test report",
  },
  "ui-test-report": {
    artifact: "ui-test-report",
    templatePath: path.join("templates", "test-report.md"),
    description: "UI test report",
  },
  "release-validation": {
    artifact: "release-validation",
    templatePath: path.join("templates", "test-report.md"),
    description: "Release validation report",
  },
  "product-doc": {
    artifact: "product-doc",
    templatePath: path.join("templates", "product-doc.md"),
    description: "User-facing product documentation",
  },
  "project-overview": {
    artifact: "project-overview",
    templatePath: path.join("templates", "project-overview.md"),
    description: "Repository overview",
  },
  "solution-map": {
    artifact: "solution-map",
    templatePath: path.join("templates", "solution-map.md"),
    description: "Solution and subsystem map",
  },
  "dependency-map": {
    artifact: "dependency-map",
    templatePath: path.join("templates", "dependency-map.md"),
    description: "Dependency and blast-radius map",
  },
  "skill-recommendation": {
    artifact: "skill-recommendation",
    description: "Recommendation-driven skill tuning notes",
  },
  "implementation-notes": {
    artifact: "implementation-notes",
    description: "Implementation notes and change summary",
  },
  "fix-summary": {
    artifact: "fix-summary",
    description: "Fix summary and verification notes",
  },
  "run-summary": {
    artifact: "run-summary",
    description: "Workflow run summary",
  },
};

export function getArtifactTemplate(artifact: string): PromptArtifactTemplate {
  return TEMPLATE_MAP[artifact] ?? {
    artifact,
    description: `Artifact output for ${artifact}`,
  };
}