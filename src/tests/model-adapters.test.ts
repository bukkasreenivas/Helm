import { describe, it, expect } from "vitest";
import { parseStructuredModelResponse } from "../lib/model-adapters";

describe("parseStructuredModelResponse", () => {
  describe("Strategy 1: clean JSON", () => {
    it("parses summary and artifacts", () => {
      const result = parseStructuredModelResponse(
        JSON.stringify({ summary: "done", artifacts: { "code-review": "# Review\nLooks good." } }),
      );
      expect(result.summary).toBe("done");
      expect(result.artifacts["code-review"]).toBe("# Review\nLooks good.");
      expect(result.projectFiles).toEqual({});
    });

    it("parses project_files alongside artifacts", () => {
      const result = parseStructuredModelResponse(
        JSON.stringify({
          summary: "implemented",
          artifacts: { "implementation-notes": "# Notes" },
          project_files: {
            "src/Services/OrderService.cs": "public class OrderService {}",
            "tests/Unit/OrderServiceTests.cs": "[Fact] public void Test() {}",
          },
        }),
      );
      expect(result.projectFiles["src/Services/OrderService.cs"]).toBe("public class OrderService {}");
      expect(result.projectFiles["tests/Unit/OrderServiceTests.cs"]).toBe("[Fact] public void Test() {}");
    });

    it("parses project_files with no artifacts", () => {
      const result = parseStructuredModelResponse(
        JSON.stringify({
          summary: "wrote tests",
          artifacts: {},
          project_files: { "e2e/auth.spec.ts": "import { test } from '@playwright/test';" },
        }),
      );
      expect(result.projectFiles["e2e/auth.spec.ts"]).toBe("import { test } from '@playwright/test';");
    });

    it("handles JSON wrapped in a markdown code fence", () => {
      const text = "```json\n" + JSON.stringify({ summary: "ok", artifacts: {}, project_files: { "src/foo.ts": "export {}" } }) + "\n```";
      const result = parseStructuredModelResponse(text);
      expect(result.summary).toBe("ok");
      expect(result.projectFiles["src/foo.ts"]).toBe("export {}");
    });

    it("returns empty projectFiles when field is absent", () => {
      const result = parseStructuredModelResponse(
        JSON.stringify({ summary: "done", artifacts: {} }),
      );
      expect(result.projectFiles).toEqual({});
    });
  });

  describe("Strategy 2: malformed JSON (regex extraction)", () => {
    it("extracts summary and artifacts from JSON with unescaped newlines", () => {
      // Simulate model returning JSON with raw newlines inside string values
      const malformed = `{"summary": "done", "artifacts": {"notes": "line1\nline2"}, "project_files": {}}`;
      const result = parseStructuredModelResponse(malformed);
      expect(result.summary).toBe("done");
    });

    it("extracts project_files from malformed JSON", () => {
      const malformed = `{"summary": "wrote files", "artifacts": {}, "project_files": {"src/foo.ts": "export const x = 1;"}}`;
      // Force strategy 2 by breaking the outer JSON with an unescaped newline in artifacts
      const broken = `{"summary": "wrote files", "artifacts": {"a": "line1\nline2"}, "project_files": {"src/foo.ts": "export const x = 1;"}}`;
      const result = parseStructuredModelResponse(broken);
      // Strategy 1 fails, strategy 2 should extract project_files
      expect(result.projectFiles["src/foo.ts"]).toBe("export const x = 1;");
    });
  });

  describe("Strategy 3: pure markdown fallback", () => {
    it("wraps plain markdown in content artifact", () => {
      const result = parseStructuredModelResponse("# Architecture\n\nThis is the design.");
      expect(result.artifacts["content"]).toContain("# Architecture");
      expect(result.projectFiles).toEqual({});
    });
  });

  describe("edge cases", () => {
    it("returns empty objects for completely empty JSON", () => {
      const result = parseStructuredModelResponse("{}");
      expect(result.summary).toBe("");
      expect(result.artifacts).toEqual({});
      expect(result.projectFiles).toEqual({});
    });

    it("handles project_files with nested directory paths", () => {
      const result = parseStructuredModelResponse(
        JSON.stringify({
          summary: "done",
          artifacts: {},
          project_files: { "src/app/auth/components/login.component.ts": "export class LoginComponent {}" },
        }),
      );
      expect(result.projectFiles["src/app/auth/components/login.component.ts"]).toBe("export class LoginComponent {}");
    });
  });
});
