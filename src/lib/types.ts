export interface ManifestConfig {
  schema_version: number;
  pack_name?: string;
  project_id: string;
  project_name: string;
  root_path: string;
  default_workflow: string;
  startup_command?: string;
  shutdown_command?: string;
  backend_test_command?: string;
  frontend_test_command?: string;
  ui_e2e_test_command?: string;
  local_urls?: Record<string, string>;
  important_files?: string[];
  optional_supplements?: string[];
  run_artifact_root: string;
  technical_doc_root: string;
  review_doc_root: string;
  product_doc_root: string;
  retain_test_reports?: boolean;
  product_doc_required?: boolean;
  product_doc_template?: string;
  repo_scan_mode?: "full_repo" | "selected_paths";
  repo_scan_roots?: string[];
  solution_files?: string[];
  subsystems?: Record<string, { path: string; type: string }>;
  cross_solution_changes_expected?: boolean;
  architecture_scope_default?: "repo" | "subsystem";
  workflow_overrides?: Record<string, unknown>;
  role_overrides?: Record<string, string>;
  skill_overrides?: Record<string, unknown>;
  environment_notes?: string[];
  enabled_roles?: string[];
}

export interface PackDefinition {
  name: string;
  extends?: string;
  description?: string;
}

export interface ModelsConfig {
  schema_version: number;
  roles: Record<string, string>;
  fallbacks?: Record<string, string>;
}

export interface RoleDefinition {
  skills: string[];
  writes_artifacts?: string[];
  allowed_workflows?: string[];
}

export interface RolesConfig {
  schema_version: number;
  roles: Record<string, RoleDefinition>;
}

export interface WorkflowStage {
  id: string;
  role: string;
  depends_on: string[];
  parallel_group?: string | null;
  required_artifacts?: string[];
  output_target?: keyof Pick<ManifestConfig, "run_artifact_root" | "technical_doc_root" | "review_doc_root" | "product_doc_root">;
  success_criteria?: string[];
  /** "stop" — abort the run (default). "route_to_fixer" — run the fixer role for this stage's domain instead. */
  on_failure?: "stop" | "route_to_fixer";
}

export interface WorkflowConfig {
  schema_version: number;
  workflow_id: string;
  description: string;
  caveman?: { mode?: string; notes?: string };
  stages: WorkflowStage[];
}

export interface LoadedProjectConfig {
  repoRoot: string;
  agentControlRoot: string;
  manifest: ManifestConfig;
  models: ModelsConfig;
  roles: RolesConfig;
}

export interface StageExecutionResult {
  stageId: string;
  role: string;
  model: string;
  success: boolean;
  summary: string;
  createdArtifacts: string[];
  writtenFiles: string[];
  warnings: string[];
  commandOutput?: string;
}

export interface PromptArtifactTemplate {
  artifact: string;
  templatePath?: string;
  description: string;
}

export interface ModelExecutionRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelExecutionResponse {
  text: string;
  raw?: unknown;
}

/**
 * Abstraction over model execution.
 * The CLI uses the built-in HTTP adapters (OpenAI / Anthropic / Google).
 * The VS Code extension registers a vscode.lm-backed implementation via
 * registerModelExecutor() so no API keys are required.
 */
export interface IModelExecutor {
  execute(request: ModelExecutionRequest): Promise<ModelExecutionResponse>;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}