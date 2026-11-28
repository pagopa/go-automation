import type { RunbookOutcome } from './RunbookOutcome.js';
import type { RunbookOutput } from './RunbookOutput.js';
import type { RunbookCheck } from './RunbookCheck.js';
import type { ClassifiedRunbookCheck } from './ClassifiedRunbookCheck.js';
import type { CoverageReason } from '../../../engine/index.js';
import { countCoverageByReason } from './countCoverageByReason.js';

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

const HISTORICAL_DATA_UNAVAILABLE_SIGNATURES: ReadonlyArray<string> = [
  'before the log groups creation time',
  'exceeds the log groups log retention settings',
];

function isHistoricalDataUnavailable(text: string): boolean {
  const lower = text.toLowerCase();
  return HISTORICAL_DATA_UNAVAILABLE_SIGNATURES.some((signature) => lower.includes(signature));
}

function isConfigError(text: string): boolean {
  if (isHistoricalDataUnavailable(text)) return false;
  const lower = text.toLowerCase();
  return CONFIG_ERROR_SIGNATURES.some((signature) => lower.includes(signature));
}

function classifyFailure(error: string): 'NO-DATA' | 'CONFIG-ERROR' | 'EXECUTION-ERROR' {
  if (isHistoricalDataUnavailable(error)) return 'NO-DATA';
  if (isConfigError(error)) return 'CONFIG-ERROR';
  return 'EXECUTION-ERROR';
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
  const incompleteSources = countIncompleteSources(output);
  const coverageField = incompleteSources === undefined ? {} : { incompleteSources };
  const recoveredText = output.execution.recoveredErrors.map((error) => `${error.stepId}: ${error.error}`).join(' | ');

  switch (outcome.kind) {
    case 'known-error-matched':
      return {
        status: 'HIT',
        outcomeKind: outcome.kind,
        matchedKnownErrorCodes: outcome.detections.map((detection) => detection.code),
        ...coverageField,
        ...base,
      };
    case 'inconclusive':
      return {
        status: 'INCONCLUSIVE',
        outcomeKind: outcome.kind,
        matchedKnownErrorCodes: [],
        ...coverageField,
        ...(recoveredText !== '' ? { error: recoveredText } : {}),
        ...(output.context.fields.length > 0 ? { fields: output.context.fields } : {}),
        ...(outcome.fallbackMessage !== undefined ? { fallbackMessage: outcome.fallbackMessage } : {}),
        ...base,
      };
    case 'failed':
    case 'aborted':
    case 'procedure-failure': {
      const error = outcomeError(outcome) || recoveredText;
      return {
        status: classifyFailure(error),
        outcomeKind: outcome.kind,
        matchedKnownErrorCodes: [],
        ...(error !== '' ? { error } : {}),
        ...base,
      };
    }
    case 'unknown-error':
    case 'procedure-success': {
      if (recoveredText !== '' && isConfigError(recoveredText)) {
        return {
          status: 'CONFIG-ERROR',
          outcomeKind: outcome.kind,
          matchedKnownErrorCodes: [],
          error: recoveredText,
          ...base,
        };
      }
      const noData = stats === undefined || stats.recordsMatched === 0 || stats.recordsScanned === 0;
      // These are the outcomes someone has to diagnose, so they carry the
      // evidence the fallback would have shown on screen.
      const fallbackMessage = outcome.kind === 'unknown-error' ? outcome.fallbackMessage : undefined;
      return {
        status: noData ? 'NO-DATA' : 'MISS',
        outcomeKind: outcome.kind,
        matchedKnownErrorCodes: [],
        ...(recoveredText !== '' ? { error: recoveredText } : {}),
        ...(output.context.fields.length > 0 ? { fields: output.context.fields } : {}),
        ...(fallbackMessage !== undefined ? { fallbackMessage } : {}),
        ...base,
      };
    }
    default: {
      const exhaustive: never = outcome;
      throw new Error(`Unhandled runbook outcome kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Counts the incomplete sources of an output by reason.
 *
 * @returns The counts, or `undefined` when the evidence is complete
 */
function countIncompleteSources(output: RunbookOutput): Readonly<Partial<Record<CoverageReason, number>>> | undefined {
  if (output.coverage.sources.length === 0) return undefined;
  return Object.fromEntries(countCoverageByReason(output.coverage.sources));
}

/** Classification used when no registered runbook exists for an occurrence. */
export function noRunbookCheck(): RunbookCheck {
  return { status: 'NO_RUNBOOK', matchedKnownErrorCodes: [] };
}
