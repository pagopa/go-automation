import type { CommandResult } from './CommandResult.js';

/** Runs an external command synchronously; injected so the adapters can be tested without git or npm. */
export type RunCommandFn = (command: string, args: ReadonlyArray<string>, cwd: string) => CommandResult;
