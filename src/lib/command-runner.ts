import { exec } from "node:child_process";
import type { ExecException } from "node:child_process";

export interface CommandRunResult {
  success: boolean;
  output: string;
  exitCode: number;
}

function resolveShell(): string {
  if (process.platform === "win32") {
    return process.env.ComSpec ?? "cmd.exe";
  }
  return process.env.SHELL ?? "/bin/sh";
}

export async function runCommand(command: string, cwd: string): Promise<CommandRunResult> {
  return new Promise((resolve) => {
    exec(command, { cwd, maxBuffer: 1024 * 1024 * 16, shell: resolveShell() }, (error: ExecException | null, stdout: string, stderr: string) => {
      const output = `${stdout}${stderr}`.trim();
      if (error) {
        resolve({
          success: false,
          output,
          exitCode: typeof error.code === "number" ? error.code : 1,
        });
        return;
      }

      resolve({
        success: true,
        output,
        exitCode: 0,
      });
    });
  });
}