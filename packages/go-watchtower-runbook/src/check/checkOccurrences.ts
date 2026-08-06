import type { AlarmEventDto } from '@go-automation/go-watchtower-client';

import type { RtaCheckInput, RtaCheckReport, RtaCheckRow } from '../types/RtaCheckReport.js';
import type { CheckProgressHandler } from '../types/CheckProgressEvent.js';
import type { RunbookCheckCache } from '../cache/RunbookCheckCache.js';
import { buildReport } from './buildReport.js';
import { checkOccurrence } from './checkOccurrence.js';
import type { RunbookCheckContext } from './checkOccurrence.js';

export interface CheckOccurrencesInput {
  readonly context: RunbookCheckContext;
  readonly occurrences: ReadonlyArray<AlarmEventDto>;
  /** Static run inputs echoed in the report. */
  readonly reportInput: RtaCheckInput;
  /**
   * Occurrences processed at the same time. `1` keeps the CloudWatch cost bounded
   * and preserves the historical sequential ordering.
   */
  readonly concurrency: number;
  readonly onProgress?: CheckProgressHandler;
  readonly cache?: RunbookCheckCache;
}

/**
 * Checks every occurrence and aggregates the data-only report.
 *
 * Rows keep the input order regardless of concurrency, so two runs over the same
 * occurrences produce identical reports. Complexity: O(N) over the occurrences.
 *
 * @param input - Context, occurrences, report inputs, concurrency and optional ports
 * @returns The machine-readable report
 */
export async function checkOccurrences(input: CheckOccurrencesInput): Promise<RtaCheckReport> {
  const rows = await runRows(input);
  return buildReport(input.reportInput, rows);
}

async function runRows(input: CheckOccurrencesInput): Promise<ReadonlyArray<RtaCheckRow>> {
  const total = input.occurrences.length;
  const rows: RtaCheckRow[] = new Array<RtaCheckRow>(total);
  const workers = Math.max(1, Math.min(Math.trunc(input.concurrency), total));
  let next = 0;

  const runWorker = async (): Promise<void> => {
    for (;;) {
      const position = next;
      next += 1;
      const occurrence = input.occurrences[position];
      if (occurrence === undefined) return;

      const index = position + 1;
      input.onProgress?.({ kind: 'OCCURRENCE_STARTED', index, total, occurrence });
      const row = await checkOccurrence({
        context: input.context,
        occurrence,
        ...(input.cache === undefined ? {} : { cache: input.cache }),
      });
      rows[position] = row;
      input.onProgress?.({ kind: 'OCCURRENCE_COMPLETED', index, total, occurrence, row });
    }
  };

  await Promise.all(Array.from({ length: workers }, async () => await runWorker()));
  return rows;
}
