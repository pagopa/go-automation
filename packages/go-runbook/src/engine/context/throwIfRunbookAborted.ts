import type { RunbookContext } from '../types/RunbookContext.js';
import { RUNBOOK_ABORTED_MESSAGE } from './RUNBOOK_ABORTED_MESSAGE.js';

/** Throws a standard abort error before a runbook starts another unit of work. */
export function throwIfRunbookAborted(context: Pick<RunbookContext, 'signal'>): void {
  if (context.signal?.aborted === true) {
    throw new DOMException(RUNBOOK_ABORTED_MESSAGE, 'AbortError');
  }
}
