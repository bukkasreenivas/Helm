import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWorkflow } from "../commands/run-workflow.js";
import { materializePack } from "../lib/pack-loader.js";
import { loadYamlFile, writeYamlFile } from "../lib/yaml-config.js";
import * as stageExecutorModule from "../lib/stage-executor.js";
import type { ManifestConfig, WorkflowConfig, LoadedProjectConfig, WorkflowStage, StageExecutionResult } from "../lib/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.HELM_MOCK_MODE;
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function createWorkflowRepo(workflowYaml: WorkflowConfig): Promise<{ repoRoot: string; agentControlRoot: string }> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "helm-workflow-"));
  tempRoots.push(tempRoot);

  const repoRoot = path.join(tempRoot, "repo");
  const agentControlRoot = path.join(repoRoot, "agent-control");
  await fs.mkdir(repoRoot, { recursive: true });
  await materializePack("default", agentControlRoot);

  // Point manifest at this temp repo root so path validation passes.
  const manifestPath = path.join(agentControlRoot, "manifest.yaml");
  const manifest = await loadYamlFile<ManifestConfig>(manifestPath);
  manifest.root_path = repoRoot;
  manifest.project_id = "test-project";
  manifest.project_name = "Test Project";
  manifest.pack_name = "default";
  manifest.default_workflow = workflowYaml.workflow_id;
  manifest.product_doc_required = false;
  await writeYamlFile(manifestPath, manifest);

  // Write the custom workflow yaml.
  const workflowPath = path.join(agentControlRoot, "workflows", `${workflowYaml.workflow_id}.yaml`);
  await writeYamlFile(workflowPath, workflowYaml);

  return { repoRoot, agentControlRoot };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("run-workflow: on_failure routing", () => {
  beforeEach(() => {
    process.env.HELM_MOCK_MODE = "true";
  });

  it("completes normally when no stage fails", async () => {
    const { repoRoot } = await createWorkflowRepo({
      schema_version: 1,
      workflow_id: "simple-pass",
      description: "All stages succeed.",
      stages: [
        {
          id: "architecture",
          role: "architect",
          depends_on: [],
          required_artifacts: ["architecture"],
          output_target: "technical_doc_root",
          on_failure: "stop",
        },
      ],
    });

    await expect(
      runWorkflow(repoRoot, { feature: "test-feature", workflow: "simple-pass", skipValidate: true }),
    ).resolves.toBeUndefined();

    const runRoot = path.join(repoRoot, "agent-control", "runs");
    const runs = await fs.readdir(runRoot);
    expect(runs.length).toBe(1);
    const runDir = path.join(runRoot, runs[0]);
    const files = await fs.readdir(runDir);
    expect(files).toContain("architecture.md");
    expect(files).toContain("run-summary.md");
  });

  it("aborts the run when on_failure=stop and stage throws", async () => {
    const { repoRoot } = await createWorkflowRepo({
      schema_version: 1,
      workflow_id: "fail-stop",
      description: "First stage fails with on_failure=stop.",
      stages: [
        {
          id: "architecture",
          role: "architect",
          depends_on: [],
          required_artifacts: ["architecture"],
          output_target: "technical_doc_root",
          on_failure: "stop",
        },
        {
          id: "backend_implementation",
          role: "backend_dev",
          depends_on: ["architecture"],
          required_artifacts: ["implementation-notes"],
          output_target: "run_artifact_root",
          on_failure: "stop",
        },
      ],
    });

    // Simulate a model failure for the first stage only.
    vi.spyOn(stageExecutorModule, "executeStage").mockRejectedValueOnce(new Error("Model unavailable"));

    await expect(
      runWorkflow(repoRoot, { feature: "test-feature", workflow: "fail-stop", skipValidate: true }),
    ).rejects.toThrow("Model unavailable");
  });

  it("routes to fixer and continues when on_failure=route_to_fixer", async () => {
    const { repoRoot } = await createWorkflowRepo({
      schema_version: 1,
      workflow_id: "fail-route",
      description: "Testing stage fails and is routed to backend_fixer.",
      stages: [
        {
          id: "backend_testing",
          role: "backend_tester",
          depends_on: [],
          required_artifacts: ["backend-test-report"],
          output_target: "technical_doc_root",
          on_failure: "route_to_fixer",
        },
        {
          id: "review",
          role: "reviewer",
          depends_on: ["backend_testing"],
          required_artifacts: ["code-review"],
          output_target: "review_doc_root",
          on_failure: "stop",
        },
      ],
    });

    // Fail only the first executeStage call (backend_testing); subsequent calls succeed via mock.
    vi.spyOn(stageExecutorModule, "executeStage").mockRejectedValueOnce(new Error("Test command failed"));

    // Should resolve: fixer ran instead of aborting.
    await expect(
      runWorkflow(repoRoot, { feature: "test-feature", workflow: "fail-route", skipValidate: true }),
    ).resolves.toBeUndefined();

    const runRoot = path.join(repoRoot, "agent-control", "runs");
    const runs = await fs.readdir(runRoot);
    // There should be exactly one run folder and it should match our workflow + feature.
    const matchingRuns = runs.filter((r) => r.includes("fail-route") && r.includes("test-feature"));
    expect(matchingRuns.length).toBe(1);
    const summaryFiles = await fs.readdir(path.join(runRoot, matchingRuns[0]));

    // The fixer stage summary should have been written.
    expect(summaryFiles).toContain("backend_testing_fixer.md");
    // The downstream review stage should also have run.
    expect(summaryFiles).toContain("review.md");
  });

  it("throws when route_to_fixer is set but no fixer role exists for the domain", async () => {
    const { repoRoot } = await createWorkflowRepo({
      schema_version: 1,
      workflow_id: "fail-no-fixer",
      description: "Orchestrator fails with route_to_fixer — no fixer role for this domain.",
      stages: [
        {
          id: "orchestrate",
          role: "orchestrator",
          depends_on: [],
          required_artifacts: [],
          output_target: "run_artifact_root",
          on_failure: "route_to_fixer",
        },
      ],
    });

    vi.spyOn(stageExecutorModule, "executeStage").mockRejectedValueOnce(new Error("Orchestration failed"));

    await expect(
      runWorkflow(repoRoot, { feature: "test-feature", workflow: "fail-no-fixer", skipValidate: true }),
    ).rejects.toThrow(/no fixer role found/);
  });
});

// ---------------------------------------------------------------------------
// Artifact context scoping
// ---------------------------------------------------------------------------

describe("run-workflow: transitive artifact scoping", () => {
  beforeEach(() => {
    process.env.HELM_MOCK_MODE = "true";
  });

  /**
   * Verify that a downstream stage receives artifacts from ALL its ancestors
   * (transitively), not just its immediate depends_on parents.
   *
   * Workflow:  architecture → implementation → review → release_validation
   *
   * Expected context received by release_validation:
   *   architecture artifacts + implementation artifacts + review artifacts
   *
   * With the old direct-parent scoping, release_validation would only have
   * received review artifacts (its immediate parent).
   */
  it("passes transitive ancestor artifacts to downstream stages", async () => {
    const capturedContexts: Array<{ stageId: string; artifactPaths: string[] }> = [];

    // Intercept executeStage to record what prior artifacts each stage receives,
    // then delegate to a minimal mock result so the run can complete.
    vi.spyOn(stageExecutorModule, "executeStage").mockImplementation(
      async (
        _config: LoadedProjectConfig,
        _workflow: WorkflowConfig,
        stage: WorkflowStage,
        _feature: string,
        _opts: { dryRun?: boolean },
        priorArtifacts: string[],
      ): Promise<StageExecutionResult> => {
        capturedContexts.push({ stageId: stage.id, artifactPaths: [...priorArtifacts] });
        return {
          stageId: stage.id,
          role: stage.role,
          model: "mock",
          success: true,
          summary: `Mock: ${stage.id}`,
          createdArtifacts: [`/tmp/mock-${stage.id}.md`],
          warnings: [],
        };
      },
    );

    const { repoRoot } = await createWorkflowRepo({
      schema_version: 1,
      workflow_id: "transitive-test",
      description: "Tests transitive artifact context scoping.",
      stages: [
        {
          id: "architecture",
          role: "architect",
          depends_on: [],
          required_artifacts: ["architecture"],
          output_target: "technical_doc_root",
          on_failure: "stop",
        },
        {
          id: "implementation",
          role: "backend_dev",
          depends_on: ["architecture"],
          required_artifacts: ["implementation-notes"],
          output_target: "run_artifact_root",
          on_failure: "stop",
        },
        {
          id: "review",
          role: "reviewer",
          depends_on: ["implementation"],
          required_artifacts: ["code-review"],
          output_target: "review_doc_root",
          on_failure: "stop",
        },
        {
          id: "release_validation",
          role: "release_validator",
          depends_on: ["review"],
          required_artifacts: ["release-validation"],
          output_target: "technical_doc_root",
          on_failure: "stop",
        },
      ],
    });

    await runWorkflow(repoRoot, {
      feature: "test-feature",
      workflow: "transitive-test",
      skipValidate: true,
    });

    const arch = capturedContexts.find((c) => c.stageId === "architecture");
    const impl = capturedContexts.find((c) => c.stageId === "implementation");
    const review = capturedContexts.find((c) => c.stageId === "review");
    const release = capturedContexts.find((c) => c.stageId === "release_validation");

    // architecture has no ancestors → no prior artifacts
    expect(arch?.artifactPaths).toHaveLength(0);

    // implementation only depends on architecture
    expect(impl?.artifactPaths).toContain("/tmp/mock-architecture.md");
    expect(impl?.artifactPaths).toHaveLength(1);

    // review transitively depends on architecture + implementation
    expect(review?.artifactPaths).toContain("/tmp/mock-architecture.md");
    expect(review?.artifactPaths).toContain("/tmp/mock-implementation.md");
    expect(review?.artifactPaths).toHaveLength(2);

    // release_validation transitively depends on all three upstream stages
    expect(release?.artifactPaths).toContain("/tmp/mock-architecture.md");
    expect(release?.artifactPaths).toContain("/tmp/mock-implementation.md");
    expect(release?.artifactPaths).toContain("/tmp/mock-review.md");
    expect(release?.artifactPaths).toHaveLength(3);
  });

  it("diamond dependency does not duplicate artifacts", async () => {
    const capturedContexts: Array<{ stageId: string; artifactPaths: string[] }> = [];

    vi.spyOn(stageExecutorModule, "executeStage").mockImplementation(
      async (
        _config: LoadedProjectConfig,
        _workflow: WorkflowConfig,
        stage: WorkflowStage,
        _feature: string,
        _opts: { dryRun?: boolean },
        priorArtifacts: string[],
      ): Promise<StageExecutionResult> => {
        capturedContexts.push({ stageId: stage.id, artifactPaths: [...priorArtifacts] });
        return {
          stageId: stage.id,
          role: stage.role,
          model: "mock",
          success: true,
          summary: `Mock: ${stage.id}`,
          createdArtifacts: [`/tmp/mock-${stage.id}.md`],
          warnings: [],
        };
      },
    );

    // Diamond: architecture → backend_implementation + frontend_implementation → code_review
    const { repoRoot } = await createWorkflowRepo({
      schema_version: 1,
      workflow_id: "diamond-test",
      description: "Tests diamond dependency deduplication.",
      stages: [
        {
          id: "architecture",
          role: "architect",
          depends_on: [],
          required_artifacts: ["architecture"],
          output_target: "technical_doc_root",
          on_failure: "stop",
        },
        {
          id: "backend_implementation",
          role: "backend_dev",
          depends_on: ["architecture"],
          required_artifacts: ["implementation-notes"],
          output_target: "run_artifact_root",
          on_failure: "stop",
        },
        {
          id: "frontend_implementation",
          role: "frontend_dev",
          depends_on: ["architecture"],
          required_artifacts: ["implementation-notes"],
          output_target: "run_artifact_root",
          on_failure: "stop",
        },
        {
          id: "code_review",
          role: "reviewer",
          depends_on: ["backend_implementation", "frontend_implementation"],
          required_artifacts: ["code-review"],
          output_target: "review_doc_root",
          on_failure: "stop",
        },
      ],
    });

    await runWorkflow(repoRoot, {
      feature: "test-feature",
      workflow: "diamond-test",
      skipValidate: true,
    });

    const review = capturedContexts.find((c) => c.stageId === "code_review");

    // code_review should see architecture + both implementations — architecture not duplicated
    expect(review?.artifactPaths).toContain("/tmp/mock-architecture.md");
    expect(review?.artifactPaths).toContain("/tmp/mock-backend_implementation.md");
    expect(review?.artifactPaths).toContain("/tmp/mock-frontend_implementation.md");
    expect(review?.artifactPaths).toHaveLength(3);
  });
});
