/**
 * Final summary and exit code (§12.4, §15).
 */

import type { Core } from '@go-automation/go-common';
import type { Dispatch } from '@go-automation/go-send';

/** Statuses that make the run "completed with problems" (exit code 2). */
const PROBLEM_STATUSES: ReadonlyArray<Dispatch.RowStatus> = [
  'INVALID',
  'SEND_FAILED',
  'SEND_UNCERTAIN',
  'REFUSED',
  'VERIFY_TIMEOUT',
  'PENDING',
  'SENDING',
  'RECONCILING',
];

/**
 * Prints the summary table and the paths of the files.
 *
 * @param logger - Script logger
 * @param progress - Final progress snapshot
 * @param output - Output settings of the session
 * @param runDir - Run directory
 */
export function displaySummary(
  logger: Core.GOLogger,
  progress: Dispatch.DispatchProgress,
  output: Dispatch.DispatchSessionOutput,
  runDir: string,
): void {
  const count = (status: Dispatch.RowStatus): number => progress.byStatus.get(status) ?? 0;
  logger.section('Riepilogo');
  logger.keyValueTable({
    'Non valide': count('INVALID'),
    Inviate: count('SENT') + count('ACCEPTED') + count('REFUSED') + count('VERIFY_TIMEOUT'),
    Accettate: count('ACCEPTED'),
    Rifiutate: count('REFUSED'),
    'Verifica in timeout': count('VERIFY_TIMEOUT'),
    'Fallite all invio': count('SEND_FAILED'),
    'INCERTE (SEND_UNCERTAIN)': count('SEND_UNCERTAIN'),
    'Non inviate (interruzione)': count('SENDING') + count('RECONCILING'),
    '429 ricevuti': progress.throttled,
    Output: output.outputPath,
    Report: output.reportPath,
    'Directory del run': runDir,
  });
  if (count('SEND_UNCERTAIN') > 0) {
    logger.warning('Righe incerte: la notifica potrebbe esistere. Rilancia con --resume per riconciliarle.');
  }
}

/**
 * Exit code of a completed run: 0 without problems, 2 with failed,
 * uncertain, invalid, refused or timed-out rows.
 *
 * @param progress - Final progress snapshot
 * @returns Exit code
 */
export function exitCodeFor(progress: Dispatch.DispatchProgress): number {
  return PROBLEM_STATUSES.some((status) => (progress.byStatus.get(status) ?? 0) > 0) ? 2 : 0;
}
