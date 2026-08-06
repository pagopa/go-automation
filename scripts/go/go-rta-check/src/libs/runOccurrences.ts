import type { Core } from '@go-automation/go-common';
import type { AlarmEventDto } from '@go-automation/go-watchtower-client';
import { checkOccurrences } from '@go-automation/go-watchtower-runbook';
import type { RtaCheckInput, RtaCheckReport, RunbookCheckContext } from '@go-automation/go-watchtower-runbook';

import { productEnvLabel, renderResultsHeader, renderResultsRow } from '../report/renderConsole.js';
import { GOScriptRunbookCheckCache } from '../runner/resumeCache.js';

export interface RunOccurrencesOptions {
  readonly script: Core.GOScript;
  readonly context: RunbookCheckContext;
  readonly occurrences: ReadonlyArray<AlarmEventDto>;
  readonly reportInput: RtaCheckInput;
  readonly concurrency: number;
}

/**
 * Runs the comparison for every occurrence and prints the results **table
 * incrementally**: a header first, then one row as each occurrence completes.
 * While an occurrence runs, a spinner shows a "loading" line in its place (TTY
 * only); on completion it is replaced by the final static row. Runbook engine
 * logs are suppressed (silent engine logger).
 *
 * Execution, concurrency and aggregation live in `go-watchtower-runbook`: this
 * function is the rendering adapter and owns the filesystem resume cache.
 *
 * @param options - Script, run context, occurrences, report inputs and concurrency
 * @returns The assembled report
 */
export async function runOccurrences(options: RunOccurrencesOptions): Promise<RtaCheckReport> {
  const { script, context } = options;
  const interactive = process.stdout.isTTY === true;
  renderResultsHeader(script.logger);

  return await checkOccurrences({
    context,
    occurrences: options.occurrences,
    reportInput: options.reportInput,
    concurrency: options.concurrency,
    cache: new GOScriptRunbookCheckCache(script),
    onProgress: (event) => {
      if (event.kind === 'OCCURRENCE_STARTED') {
        if (!interactive) return;
        const label = productEnvLabel(context.productName, event.occurrence.environment?.name);
        script.prompt.startSpinner(
          `[${event.index}/${event.total}] ${label} · ${event.occurrence.firedAt} · esecuzione…`,
        );
        return;
      }
      if (interactive) script.prompt.stopSpinner();
      renderResultsRow(script.logger, context.productName, context.alarmName, event.row);
    },
  });
}
