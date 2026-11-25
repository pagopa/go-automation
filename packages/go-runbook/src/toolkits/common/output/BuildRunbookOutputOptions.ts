import type { RunbookOutputContextBuilderFn } from './RunbookOutputContextBuilderFn.js';

export interface BuildRunbookOutputOptions {
  readonly traceFile?: string;
  readonly contextBuilder?: RunbookOutputContextBuilderFn;
}
