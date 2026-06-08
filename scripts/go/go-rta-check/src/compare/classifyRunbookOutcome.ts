import type { RunbookOutput, RunbookOutcome } from '@go-automation/go-runbook';
import type { RunbookCheck } from '../types/RtaCheckReport.js';

/**
 * Lowercased substrings in an error message that indicate a **configuration**
 * problem (wrong log group / account / profile / permissions) rather than a
 * transient runtime failure. Drives the CONFIG-ERROR vs EXECUTION-ERROR split.
 */
const CONFIG_ERROR_SIGNATURES: ReadonlyArray<string> = [
  'resourcenotfound',
  'log group',
  'accessdenied',
  'access denied',
  'not authorized',
  'invalidparameter',
  'malformedquery',
  'credential',
  'expired token',
  'unrecognizedclient',
  'security token',
];

function isConfigError(text: string): boolean {
  const lower = text.toLowerCase();
  return CONFIG_ERROR_SIGNATURES.some((signature) => lower.includes(signature));
}

function outcomeError(outcome: RunbookOutcome): string {
  switch (outcome.kind) {
    case 'failed':
      return outcome.error ?? outcome.reason ?? outcome.message;
    case 'aborted':
      return outcome.reason ?? outcome.message;
    case 'procedure-failure':
      return outcome.error ?? outcome.summary;
    default:
      return '';
  }
}

/**
 * Classifies a runbook execution (V1) from its {@link RunbookOutput} into one of
 * HIT / MISS / NO-DATA / CONFIG-ERROR / EXECUTION-ERROR.
 *
 * - HIT: a known case matched.
 * - MISS: valid query, logs present (recordsMatched > 0), no known case.
 * - NO-DATA: valid query but zero records matched/scanned (retention/empty window).
 * - CONFIG-ERROR: log group/account/profile/permission problem (often a
 *   mis-configured runbook) — surfaced via failure or a recovered error.
 * - EXECUTION-ERROR: non-recoverable runtime failure (crash / failed / aborted).
 *
 * @param output - The structured runbook output
 * @returns The V1 classification with supporting fields
 */
export function classifyRunbookOutcome(output: RunbookOutput): RunbookCheck {
  const stats = output.telemetry?.cloudWatchLogs?.statistics;
  const base = {
    durationMs: output.execution.durationMs,
    ...(stats !== undefined
      ? { cloudWatchRecordsScanned: stats.recordsScanned, cloudWatchBytesScanned: stats.bytesScanned }
      : {}),
  };
  const outcome = output.outcome;
  const recoveredText = output.execution.recoveredErrors.map((error) => `${error.stepId}: ${error.error}`).join(' | ');

  switch (outcome.kind) {
    case 'known-case-matched':
      return {
        status: 'HIT',
        outcomeKind: outcome.kind,
        primaryCaseId: outcome.primaryCaseId,
        primaryCaseDescription: outcome.primaryCaseDescription,
        matchedCaseIds: outcome.matchedCases.map((knownCase) => knownCase.id),
        ...base,
      };

    case 'failed':
    case 'aborted':
    case 'procedure-failure': {
      const error = outcomeError(outcome) || recoveredText;
      return {
        status: isConfigError(error) ? 'CONFIG-ERROR' : 'EXECUTION-ERROR',
        outcomeKind: outcome.kind,
        matchedCaseIds: [],
        ...(error !== '' ? { error } : {}),
        ...base,
      };
    }

    case 'unknown-case':
    case 'procedure-success': {
      // A configuration problem can surface as a recovered error even when the
      // run "completed" without matching a case.
      if (recoveredText !== '' && isConfigError(recoveredText)) {
        return { status: 'CONFIG-ERROR', outcomeKind: outcome.kind, matchedCaseIds: [], error: recoveredText, ...base };
      }
      // recordsMatched === 0 ⇔ the error scan found nothing ⇒ NO-DATA.
      const noData = stats === undefined || stats.recordsMatched === 0 || stats.recordsScanned === 0;
      return {
        status: noData ? 'NO-DATA' : 'MISS',
        outcomeKind: outcome.kind,
        matchedCaseIds: [],
        ...(recoveredText !== '' ? { error: recoveredText } : {}),
        ...base,
      };
    }

    default: {
      const exhaustive: never = outcome;
      throw new Error(`Unhandled runbook outcome kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}
