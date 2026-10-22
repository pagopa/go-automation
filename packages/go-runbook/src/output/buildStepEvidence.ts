import { readResultFieldRows, readRowField, type ResultField } from '@go-automation/go-common/aws';
import type { StepDescriptor } from '../types/StepDescriptor.js';
import type { RunbookEvidence } from './RunbookOutputContext.js';
import type { StepEvidence } from './StepEvidence.js';
import { normalizeOutputValue } from './outputValues.js';
import { readFirstRowField } from './resultRows.js';

/** Read only explicitly declared evidence; never guess which custom queries to export. */
export function buildStepEvidence(
  steps: ReadonlyArray<StepDescriptor>,
  stepResults: ReadonlyMap<string, unknown>,
): ReadonlyArray<RunbookEvidence> {
  return steps.flatMap(({ step, evidence = [] }) => {
    if (evidence.length === 0) return [];
    const rows = readResultFieldRows(stepResults.get(step.id));
    return evidence.flatMap((definition) => {
      const items = rows
        .filter(
          (row) =>
            definition.filter === undefined || readRowField(row, definition.filter.field) === definition.filter.equals,
        )
        .flatMap((row) => toEvidenceItem(row, definition));
      if (items.length === 0) return [];

      const { retention } = definition;
      const timestampField = retention.mode === 'latest' ? retention.timestampField : undefined;
      // Complete log episodes and sampled logs are presented chronologically.
      if (timestampField !== undefined || definition.type === 'log-sample') {
        const field = timestampField ?? 'timestamp';
        items.sort((left, right) => timestamp(left[field]) - timestamp(right[field]));
      }
      const sample = retention.mode === 'all' ? items : items.slice(-retention.limit);
      return [
        {
          id: definition.id,
          label: definition.label,
          type: definition.type,
          sourceStep: step.id,
          items: sample,
          truncated: sample.length < items.length,
        },
      ];
    });
  });
}

function toEvidenceItem(
  row: ReadonlyArray<ResultField>,
  definition: StepEvidence,
): ReadonlyArray<Record<string, string>> {
  const fields = new Map<string, string>();
  for (const { field, value } of row) {
    if (field !== undefined && value !== undefined && !fields.has(field)) fields.set(field, value);
  }
  const item = Object.fromEntries(fields);
  if (definition.type === 'step-output') return fields.size === 0 ? [] : [item];

  const message = normalizeOutputValue(
    readFirstRowField(row, definition.messageFields ?? ['@message', 'message', 'log']),
  );
  if (message === undefined) return [];
  return [
    {
      ...item,
      timestamp: normalizeOutputValue(readFirstRowField(row, ['@timestamp', 'timestamp'])) ?? '',
      message,
    },
  ];
}

function timestamp(value: string | undefined): number {
  const parsed = Date.parse(value ?? '');
  return Number.isNaN(parsed) ? 0 : parsed;
}
