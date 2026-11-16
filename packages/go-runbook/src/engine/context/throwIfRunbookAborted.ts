import type { RunbookContext } from '../types/RunbookContext.js';

/** Throws a standard abort error before a runbook starts another unit of work. */
export function throwIfRunbookAborted(context: Pick<RunbookContext, 'signal'>): void {
  if (context.signal?.aborted === true) {
    throw new DOMException('Runbook execution aborted by signal', 'AbortError');
  }
}
