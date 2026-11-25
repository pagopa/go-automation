import { withEnv } from '../../../../__tests__/helpers/withEnv.js';
import type { CapturedOutput } from './CapturedOutput.js';

/** Synchronous code whose output is captured. */
type CapturedFn = () => void;

/**
 * Runs `fn` synchronously while capturing `process.stdout.write` and `console.error`,
 * optionally with temporary environment variables. Everything is restored afterwards.
 * Kept synchronous on purpose: no other code (e.g. the test reporter) can write
 * to the patched stdout in between.
 *
 * @param fn - Synchronous code under test
 * @param env - Environment variables to set for the duration (`undefined` deletes the variable)
 * @returns The captured stdout and stderr text
 */
export function captureOutput(fn: CapturedFn, env: Readonly<Record<string, string | undefined>> = {}): CapturedOutput {
  let stdout = '';
  let stderr = '';
  const originalWrite = process.stdout.write.bind(process.stdout);
  const originalError = console.error.bind(console);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  };
  console.error = (...args: unknown[]): void => {
    stderr += `${args.map(String).join(' ')}\n`;
  };

  try {
    withEnv(env, fn);
  } finally {
    process.stdout.write = originalWrite;
    console.error = originalError;
  }

  return { stdout, stderr };
}
