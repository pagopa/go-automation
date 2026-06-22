import type {
  CompleteExecutionTracking,
  CompleteExecutionTrackingEntry,
  TrackingIdentifierType,
} from '@go-automation/go-watchtower-client';
import type { RunbookOutput } from '@go-automation/go-runbook';

type TrackingEntries = CompleteExecutionTracking;
type TrackingEntry = CompleteExecutionTrackingEntry;

export function buildTrackingEntries(output: RunbookOutput): TrackingEntries {
  const entries: TrackingEntry[] = [];
  for (const field of output.context.fields) {
    const identifierType = identifierTypeFor(field.name);
    if (identifierType === undefined || field.value === '') continue;
    entries.push({ identifierType, identifierValue: field.value.slice(0, 512), timestamp: output.generatedAt });
    if (entries.length === 64) break;
  }
  entries.push({
    identifierType: 'AUTOMATION_EXECUTION_ID',
    identifierValue: output.execution.executionId,
    timestamp: output.generatedAt,
  });
  return entries.slice(0, 64);
}

function identifierTypeFor(name: string): TrackingIdentifierType | undefined {
  const normalized = name.toLowerCase();
  if (normalized.includes('trace')) return 'TRACE_ID';
  if (normalized.includes('request')) return 'REQUEST_ID';
  if (normalized.includes('correlation')) return 'CORRELATION_ID';
  if (normalized.includes('fallback') || normalized.includes('uuid')) return 'FALLBACK_UUID';
  return undefined;
}
