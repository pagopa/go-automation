import type { CoverageEntry } from '../../engine/types/CoverageEntry.js';
import type { RunbookReads } from '../../engine/types/RunbookReads.js';
import { createTestLedger } from './createTestLedger.js';

/**
 * Builds the reads of a context from a list of gaps, all recorded in the window by the steps they name.
 *
 * @param gaps - Gaps of the reads, each with the step that declared it
 * @returns The read-only view of the window
 *
 * @example
 * ```typescript
 * const reads = createTestReads([{ stepId: 'query', complete: false, reason: 'saturated' }]);
 * reads.stateOf('query'); // 'saturated'
 * ```
 */
export function createTestReads(gaps: ReadonlyArray<CoverageEntry> = []): RunbookReads {
  const ledger = createTestLedger(gaps);
  return ledger.view(ledger.window);
}
