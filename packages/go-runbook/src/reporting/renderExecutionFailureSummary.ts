import type { GOLogger } from '@go-automation/go-common/core';

import { ConsoleRunbookReporter } from '../registry/reporters/ConsoleRunbookReporter.js';
import type { RunbookExecutionStatus } from '../types/RunbookExecutionStatus.js';

const OUTCOME_LABEL: Readonly<Record<Exclude<RunbookExecutionStatus, 'completed'>, string>> = {
  failed: 'esecuzione fallita',
  aborted: 'esecuzione interrotta',
};

/**
 * Renders the closing banner for a run that did not complete.
 *
 * The toolkit summaries describe an *outcome* — which known case matched, or
 * that none did. A failed run has no outcome to describe: reading
 * `terminationReason` from a context the pipeline never finished filling makes
 * a crashed query look exactly like a clean "caso non riconosciuto". This says
 * what actually happened instead.
 *
 * @param logger - Logger used to emit the banner
 * @param status - Non-completed status returned by the engine
 * @param failureReason - Why the run stopped, when the engine recorded one
 */
export function renderExecutionFailureSummary(
  logger: GOLogger,
  status: Exclude<RunbookExecutionStatus, 'completed'>,
  failureReason?: string,
): void {
  const reporter = new ConsoleRunbookReporter(logger);
  reporter.section('Esecuzione terminata');
  reporter.add(
    { label: `Esito: ${OUTCOME_LABEL[status]}` },
    { label: `Motivo: ${failureReason ?? 'non riportato dal motore'}` },
    { label: 'Nessun esito diagnostico: la pipeline non è arrivata in fondo.' },
  );
  reporter.flush();
}
