import type { RunbookOutcome } from './RunbookOutcome.js';
import type { RunbookOutput } from './RunbookOutput.js';
import type { ClassifiedRunbookCheck, RunbookCheck } from './RunbookCheck.js';

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

/** Classifies a structured runbook output for all automation consumers. */
export function classifyRunbookOutcome(output: RunbookOutput): ClassifiedRunbookCheck {
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
      if (recoveredText !== '' && isConfigError(recoveredText)) {
        return { status: 'CONFIG-ERROR', outcomeKind: outcome.kind, matchedCaseIds: [], error: recoveredText, ...base };
      }
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

/** Classification used when no registered runbook exists for an occurrence. */
export function noRunbookCheck(): RunbookCheck {
  return { status: 'NO_RUNBOOK', matchedCaseIds: [] };
}
