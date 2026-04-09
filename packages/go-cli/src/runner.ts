import { spawn } from 'node:child_process';
import type { DiscoveredScript } from './discovery.js';

export type ExecutionMode = 'source' | 'dist';

interface RunOptions {
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

  // Environment Sanitization
  const cleanEnv = getSanitizedEnv(mode, isDryRun ?? false);

  const child = spawn('node', spawnArgs, {
    stdio: 'inherit',
    cwd: script.paths.root,
    env: cleanEnv,
  });

  // Signal handlers for propagation
  const handleSignal = (signal: NodeJS.Signals): void => {
    // Forward signal to child
    child.kill(signal);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  return new Promise((resolve) => {
    child.on('close', (code) => {
      // Cleanup signal handlers
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
      resolve(code ?? 0);
    });

    child.on('error', (err) => {
      console.error(`Failed to start script: ${err.message}`);
      // Cleanup signal handlers
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
      resolve(1);
    });
  });
}

/**
 * Creates a "Clean Slate" environment for the child process
 */
function getSanitizedEnv(mode: ExecutionMode, isDryRun: boolean): NodeJS.ProcessEnv {
  const allowList = [
    'PATH',
    'HOME',
    'USER',
    'LANG',
    'SHELL',
    'PWD',
    'TERM',
    'TMPDIR',
    'SSH_AUTH_SOCK',
    'DISPLAY', // for some GUI prompts if needed
  ];

  const sanitized: NodeJS.ProcessEnv = {};

  // 1. Copy allow-listed standard vars
  for (const key of allowList) {
    if (process.env[key] !== undefined) {
      sanitized[key] = process.env[key];
    }
  }

  // 2. Copy all GO_ prefixed vars (including AWS profiles, etc.)
  // and AWS standard vars
  const envKeys = Object.keys(process.env);
  for (const key of envKeys) {
    if (key.startsWith('GO_') || key.startsWith('AWS_')) {
      sanitized[key] = process.env[key];
    }
  }

  // 3. Inject CLI-specific state
  sanitized['GO_CLI'] = 'true';
  sanitized['GO_EXEC_MODE'] = mode;
  sanitized['GO_DRY_RUN'] = isDryRun ? 'true' : 'false';

  return sanitized;
}
