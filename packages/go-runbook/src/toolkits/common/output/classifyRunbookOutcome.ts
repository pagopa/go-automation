import type { RunbookOutcome } from './RunbookOutcome.js';
import type { RunbookOutput } from './RunbookOutput.js';
import type { ClassifiedRunbookCheck, RunbookCheck } from './RunbookCheck.js';
import type { CoverageReason } from '../../../engine/types/CoverageReason.js';

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
    case 'known-case-matched':
      return {
        status: 'HIT',
        outcomeKind: outcome.kind,
        matchedCaseIds: outcome.detections.map((detection) => detection.caseId),
        ...coverageField,
        ...base,
      };
    case 'inconclusive':
      return {
        status: 'INCONCLUSIVE',
        outcomeKind: outcome.kind,
        matchedCaseIds: [],
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
      // These are the outcomes someone has to diagnose, so they carry the
      // evidence the fallback would have shown on screen.
      const fallbackMessage = outcome.kind === 'unknown-case' ? outcome.fallbackMessage : undefined;
      return {
        status: noData ? 'NO-DATA' : 'MISS',
        outcomeKind: outcome.kind,
        matchedCaseIds: [],
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
  const counts: Partial<Record<CoverageReason, number>> = {};
  for (const source of output.coverage.sources) {
    const reason = source.reason ?? 'unavailable';
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
}

/** Classification used when no registered runbook exists for an occurrence. */
export function noRunbookCheck(): RunbookCheck {
  return { status: 'NO_RUNBOOK', matchedCaseIds: [] };
}
