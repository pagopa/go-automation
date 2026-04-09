import { spawn } from 'node:child_process';
import type { DiscoveredScript } from './discovery.js';

export type ExecutionMode = 'source' | 'dist';

export interface RunOptions {
  mode: ExecutionMode;
  args: string[];
  isDryRun?: boolean;
}

/**
 * Runner - Handles spawning the child process for the selected script
 */
export async function runScript(script: DiscoveredScript, options: RunOptions): Promise<number> {
  const { mode, args, isDryRun } = options;
  const entryPoint = mode === 'source' ? script.paths.entryTs : script.paths.entryJs;

  const spawnArgs: string[] = [];

  if (mode === 'source') {
    // Run via TSX/ESM loader
    spawnArgs.push('--import', 'tsx/esm', entryPoint, ...args);
  } else {
    // Run via standard Node (compiled JS)
    spawnArgs.push(entryPoint, ...args);
  }

  return new Promise((resolve) => {
    const child = spawn('node', spawnArgs, {
      stdio: 'inherit',
      cwd: script.paths.root,
      env: {
        ...process.env,
        GO_CLI: 'true',
        GO_EXEC_MODE: mode,
        GO_DRY_RUN: isDryRun ? 'true' : 'false',
      },
    });

    child.on('close', (code) => {
      resolve(code ?? 0);
    });

    child.on('error', (err) => {
      console.error(`Failed to start script: ${err.message}`);
      resolve(1);
    });
  });
}
