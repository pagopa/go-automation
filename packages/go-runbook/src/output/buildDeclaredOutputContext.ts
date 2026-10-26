import { parseInteger } from '@go-automation/go-common/core';
import type { Runbook } from '../types/Runbook.js';
import type { RunbookExecutionResult } from '../types/RunbookExecutionResult.js';
import type { RunbookOutputContext } from './RunbookOutputContext.js';
import { addResultField, normalizeOutputValue, optionalString } from './outputValues.js';
import { buildStepEvidence } from './buildStepEvidence.js';

/** Compose family context and explicitly declared output once, for every executor. */
export function buildDeclaredOutputContext(
  runbook: Runbook,
  result: RunbookExecutionResult,
  context: RunbookOutputContext,
): RunbookOutputContext {
  const { vars, params, stepResults } = result.finalContext;
  const evidence = buildStepEvidence(runbook.steps, stepResults);
  const definition = runbook.output;
  if (definition === undefined) return { ...context, evidence: [...context.evidence, ...evidence] };

  const fields = [...context.fields];
  const diagnostics: Record<string, string | number> = {};
  for (const field of definition.fields) {
    const source = field.ref.startsWith('vars.') ? vars : params;
    const raw = normalizeOutputValue(source.get(field.ref.slice(field.ref.indexOf('.') + 1)));
    const value = field.valueType === 'integer' ? parseInteger(raw) : raw;
    if (value === undefined) continue;
    addResultField(fields, field.name, field.label, String(value));
    if (field.ref.startsWith('vars.')) diagnostics[field.name] = value;
  }

  return {
    fields,
    evidence: [...context.evidence, ...evidence],
    details: {
      alarm: {
        ...optionalString('name', params.get('alarmName')),
        ...optionalString('datetime', params.get('alarmDatetime')),
        ...optionalString('datetimeEnd', params.get('alarmDatetimeEnd')),
        timeRange: {
          ...optionalString('start', params.get('startTime')),
          ...optionalString('end', params.get('endTime')),
        },
      },
      ...context.details,
      ...(definition.metadata === undefined ? {} : { metadata: definition.metadata }),
      diagnostics,
    },
  };
}
