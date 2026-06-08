import type { Core } from '@go-automation/go-common';

import type { AlarmEventDto } from '../types/WatchtowerDtos.js';
import type { RtaCheckRow } from '../types/RtaCheckReport.js';
import { productEnvLabel, renderResultsHeader, renderResultsRow } from '../report/renderConsole.js';
import { checkOccurrence } from './checkOccurrence.js';
import type { CheckContext } from './checkOccurrence.js';

/**
 * Runs the comparison for every occurrence (sequentially, to bound CloudWatch
 * cost) and prints the results **table incrementally**: a header first, then one
 * row as each occurrence completes. While an occurrence runs, a spinner shows a
 * "loading" line in its place (TTY only); on completion it is replaced by the
 * final static row. Runbook engine logs are suppressed (silent engine logger).
 *
 * @param context - The shared per-run context
 * @param occurrences - The occurrences to process (already limited)
 * @param script - GOScript (logger for the table, prompt for the spinner)
 * @returns The assembled rows
 */
export async function runOccurrences(
  context: CheckContext,
  occurrences: ReadonlyArray<AlarmEventDto>,
  script: Core.GOScript,
): Promise<ReadonlyArray<RtaCheckRow>> {
  const interactive = process.stdout.isTTY === true;
  renderResultsHeader(script.logger);

  const rows: RtaCheckRow[] = [];
  const total = occurrences.length;
  let index = 0;
  for (const event of occurrences) {
    index += 1;
    if (interactive) {
      const label = productEnvLabel(context.productName, event.environment?.name);
      script.prompt.startSpinner(`[${index}/${total}] ${label} · ${event.firedAt} · esecuzione…`);
    }
    const row = await checkOccurrence(context, event);
    if (interactive) script.prompt.stopSpinner();
    rows.push(row);
    renderResultsRow(script.logger, context.productName, context.alarmName, row);
  }
  return rows;
}
