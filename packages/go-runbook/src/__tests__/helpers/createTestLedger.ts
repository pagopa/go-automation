import { ReadLedger } from '../../engine/reads/ReadLedger.js';
import type { CoverageEntry } from '../../engine/types/CoverageEntry.js';

/**
 * Builds a read ledger with a list of gaps, all recorded in the window by the steps they name.
 *
 * @param gaps - Gaps of the reads, each with the step that declared it
 * @returns The ledger
 */
export function createTestLedger(gaps: ReadonlyArray<CoverageEntry> = []): ReadLedger {
  const ledger = new ReadLedger();
  for (const gap of gaps) ledger.recordStep(ledger.window, gap.stepId, [gap]);
  return ledger;
}
