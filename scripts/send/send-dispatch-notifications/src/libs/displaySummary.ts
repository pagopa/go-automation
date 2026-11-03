/**
 * Final summary and exit code (§12.4, §15).
 */

import type { Core } from '@go-automation/go-common';
import type { Dispatch } from '@go-automation/go-send';

import type { SummaryContext } from '../types/SummaryContext.js';

/** Statuses that make the run "completed with problems" (exit code 2). */
const PROBLEM_STATUSES: ReadonlyArray<Dispatch.RowStatus> = [
  'INVALID',
  'SEND_FAILED',
  'SEND_UNCERTAIN',
  'REFUSED',
  'VERIFY_TIMEOUT',
  'REQUEST_ID_NOT_FOUND',
  'PENDING',
  'SENDING',
  'RECONCILING',
];

/** Characters of the error message shown per error code. */
const MESSAGE_PREVIEW = 100;

/**
 * Prints the summary: counts by outcome, phase durations, average send
 * rate, files, and the rows with errors grouped by code (first 5 row keys).
 *
 * @param logger - Script logger
 * @param context - Final figures of the session
 */
export function displaySummary(logger: Core.GOLogger, context: SummaryContext): void {
  const { progress, statistics } = context;
  const count = (status: Dispatch.RowStatus): number => progress.byStatus.get(status) ?? 0;
  const accepted = count('ACCEPTED') + count('REQUEST_ID_FOUND') + count('REQUEST_ID_NOT_FOUND');
  logger.section('Riepilogo');
  logger.keyValueTable({
    'Non valide': count('INVALID'),
    Inviate: count('SENT') + accepted + count('REFUSED') + count('VERIFY_TIMEOUT'),
    Accettate: accepted,
    Rifiutate: count('REFUSED'),
    'Verifica in timeout': count('VERIFY_TIMEOUT'),
    'requestId trovati': count('REQUEST_ID_FOUND'),
    'requestId non trovati': count('REQUEST_ID_NOT_FOUND'),
    'requestId in attesa': progress.requestIdPending,
    'Fallite all invio': count('SEND_FAILED'),
    'INCERTE (SEND_UNCERTAIN)': count('SEND_UNCERTAIN'),
    'Non inviate (interruzione)': count('SENDING') + count('RECONCILING'),
    '429 ricevuti': progress.throttled,
    'Durata validazione': formatDuration(context.validationMs),
    'Durata invio e verifiche': formatDuration(context.executionMs),
    'Rate medio di invio': statistics.averageRate === undefined ? '—' : `${statistics.averageRate.toFixed(1)}/s`,
    Output: context.output.outputPath,
    Report: context.output.reportPath,
    'Directory del run': context.runDir,
  });
  if (context.failures.length > 0) {
    logger.section('Righe con errori, per codice');
    logger.simpleTable(
      context.failures.map((failure) => ({
        codice: failure.code,
        righe: failure.count,
        esempi: failure.rowKeys.join(', '),
        messaggio:
          failure.message.length > MESSAGE_PREVIEW ? `${failure.message.slice(0, MESSAGE_PREVIEW)}…` : failure.message,
      })),
    );
  }
  if (count('SEND_UNCERTAIN') > 0) {
    logger.warning('Righe incerte: la notifica potrebbe esistere. Rilancia con --resume per riconciliarle.');
  }
}

/**
 * Human-readable duration (`1h 02m`, `3m 05s`, `12s`).
 *
 * @param ms - Milliseconds
 * @returns Formatted duration
 */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
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
