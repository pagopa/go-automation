import type { ExecutionAbortCause } from '../types/ExecutionAbortCause.js';

/** Owns one execution signal and preserves the first typed abort cause. */
export class ExecutionAbortCoordinator {
  private readonly controller = new AbortController();
  private abortCause: ExecutionAbortCause | undefined;

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get cause(): ExecutionAbortCause | undefined {
    return this.abortCause;
  }

  abort(cause: ExecutionAbortCause): void {
    if (this.abortCause !== undefined) return;
    this.abortCause = cause;
    this.controller.abort(new Error(cause));
  }
}
