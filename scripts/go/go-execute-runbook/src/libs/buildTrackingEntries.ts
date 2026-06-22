import type {
  CompleteExecutionTracking,
  CompleteExecutionTrackingEntry,
  TrackingIdentifierType,
} from '@go-automation/go-watchtower-client';
import type { RunbookResultField } from '@go-automation/go-runbook';

type TrackingEntries = CompleteExecutionTracking;
type TrackingEntry = CompleteExecutionTrackingEntry;
interface TrackingOutput {
  readonly generatedAt: string;
  readonly execution: { readonly executionId: string };
  readonly context: { readonly fields: ReadonlyArray<RunbookResultField> };
}

const MAX_TRACKING_ENTRIES = 64;
const MAX_CONTEXT_TRACKING_ENTRIES = MAX_TRACKING_ENTRIES - 1;

export function buildTrackingEntries(output: TrackingOutput): TrackingEntries {
  const entries: TrackingEntry[] = [];
  for (const field of output.context.fields) {
    const identifierType = identifierTypeFor(field.name);
    if (identifierType === undefined || field.value === '') continue;
    entries.push({ identifierType, identifierValue: field.value.slice(0, 512), timestamp: output.generatedAt });
    if (entries.length === MAX_CONTEXT_TRACKING_ENTRIES) break;
  }
  entries.push({
    identifierType: 'AUTOMATION_EXECUTION_ID',
    identifierValue: output.execution.executionId,
    timestamp: output.generatedAt,
  });
  return entries;
}

function identifierTypeFor(name: string): TrackingIdentifierType | undefined {
  const normalized = name.toLowerCase();
  if (normalized.includes('trace')) return 'TRACE_ID';
  if (normalized.includes('request')) return 'REQUEST_ID';
  if (normalized.includes('correlation')) return 'CORRELATION_ID';
  if (normalized.includes('fallback') || normalized.includes('uuid')) return 'FALLBACK_UUID';
  return undefined;
}
