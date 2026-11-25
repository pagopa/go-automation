import { spawnSync } from 'node:child_process';

import type { CommandResult } from '../types/CommandResult.js';

/**
 * Runs a command synchronously and captures its output (the real {@link RunCommandFn}). The
 * environment is inherited: tokens such as `GITHUB_TOKEN` reach the command.
 *
 * @param command - Executable
 * @param args - Arguments
 * @param cwd - Working folder
 * @returns Exit status and output
 */
export function runCommand(command: string, args: ReadonlyArray<string>, cwd: string): CommandResult {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return {
    status: result.error === undefined ? result.status : null,
    stdout: result.stdout ?? '',
    stderr: result.error === undefined ? (result.stderr ?? '') : result.error.message,
  };
}
