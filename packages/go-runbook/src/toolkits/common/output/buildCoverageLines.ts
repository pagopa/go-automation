import type { CoverageReason, ObservedErrorUnit, RunbookExecutionResult } from '../../../engine/index.js';
import { countCoverageByReason } from './countCoverageByReason.js';
import { ErrorTreeView } from './tree/ErrorTreeView.js';
import { ERROR_CHAIN_INTERRUPTION_WORDS } from './tree/ERROR_CHAIN_INTERRUPTION_WORDS.js';

/** Words of the coverage line, by reason of the incomplete source. */
const COVERAGE_REASON_WORDS: Readonly<Record<CoverageReason, string>> = {
  saturated: 'sature',
  unavailable: 'non disponibili',
  skipped: 'saltate',
  manual: 'a correlazione manuale',
};

/** Words of the unit of the observed errors. */
const UNIT_WORDS: Readonly<Record<ObservedErrorUnit, string>> = {
  request: 'richieste',
  invocation: 'invocazioni',
  errorRow: "righe d'errore",
};

/**
 * The coverage lines of an execution: compact counts by reason, never the text of a provider error.
 *
 * - `Errori senza caso noto: K (errori in fondo a una catena che nessun caso noto riconosce)` when some leaves of the
 *   error tree matched no known error;
 * - `Catene interrotte: K (<reason> N, …)` when some chains of the error tree were interrupted;
 * - `Non esaminati: [almeno] K <unit>` when the runbook observed more errors than it examined;
 * - `Evidenza incompleta: K fonti (<reason> N, …)` when some sources are incomplete.
 *
 * Used by the analysis notes. Complexity: O(M + C) over the chain members and the coverage entries.
 *
 * @param result - Result of the execution
 * @returns The lines, empty when there is nothing to report
 *
 * @example
 * ```typescript
 * buildCoverageLines(result);
 * // ['Non esaminati: 4 richieste', 'Evidenza incompleta: 1 fonti (sature 1)']
 * ```
 */
export function buildCoverageLines(
  result: Pick<RunbookExecutionResult, 'coverage' | 'observedErrors' | 'chains' | 'tree'>,
): ReadonlyArray<string> {
  return coverageLinesOf(result, new ErrorTreeView(result));
}

/**
 * {@link buildCoverageLines} with the view of the tree already built.
 *
 * @param result - Result of the execution
 * @param view - The view of its error tree
 * @returns The lines, empty when there is nothing to report
 */
export function coverageLinesOf(
  result: Pick<RunbookExecutionResult, 'coverage' | 'observedErrors'>,
  view: ErrorTreeView,
): ReadonlyArray<string> {
  const lines: string[] = [];
  const unrecognized = view.unrecognizedLeaves();
  if (unrecognized > 0)
    lines.push(
      `Errori senza caso noto: ${String(unrecognized)} (errori in fondo a una catena che nessun caso noto riconosce)`,
    );
  const interrupted = view.interruptions();
  if (interrupted.size > 0) {
    const total = [...interrupted.values()].reduce((sum, count) => sum + count, 0);
    const detail = [...interrupted].map(
      ([reason, count]) => `${ERROR_CHAIN_INTERRUPTION_WORDS[reason]} ${String(count)}`,
    );
    lines.push(`Catene interrotte: ${String(total)} (${detail.join(', ')})`);
  }
  const errors = result.observedErrors;
  if (errors !== undefined && errors.observed > errors.examined) {
    const unexamined = errors.observed - errors.examined;
    lines.push(
      `Non esaminati: ${errors.lowerBound === true ? 'almeno ' : ''}${String(unexamined)} ${UNIT_WORDS[errors.unit]}`,
    );
  }
  if (result.coverage.length > 0) {
    const detail = [...countCoverageByReason(result.coverage)]
      .map(([reason, count]) => `${COVERAGE_REASON_WORDS[reason]} ${String(count)}`)
      .join(', ');
    lines.push(`Evidenza incompleta: ${String(result.coverage.length)} fonti (${detail})`);
  }
  return lines;
}
