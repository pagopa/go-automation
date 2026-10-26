import type { StepDescriptor } from '../types/StepDescriptor.js';
import type { RunbookOutputDefinition } from '../output/RunbookOutputDefinition.js';
import type { ValidationErrorEntry } from './ValidationErrorEntry.js';

/** Catch invalid output declarations while assembling the pipeline, before running queries. */
export function validateOutputDefinitions(
  steps: ReadonlyArray<StepDescriptor>,
  output?: RunbookOutputDefinition,
): ReadonlyArray<ValidationErrorEntry> {
  const errors: ValidationErrorEntry[] = [];
  const evidenceIds = new Set<string>();
  for (const { step, evidence = [] } of steps) {
    for (const definition of evidence) {
      if (definition.id.trim() === '' || definition.label.trim() === '') {
        errors.push({
          code: 'INVALID_OUTPUT_DEFINITION',
          stepId: step.id,
          message: 'Evidence requires a non-empty id and label.',
        });
      }
      if (evidenceIds.has(definition.id)) {
        errors.push({
          code: 'INVALID_OUTPUT_DEFINITION',
          stepId: step.id,
          message: `Duplicate evidence id: "${definition.id}".`,
        });
      }
      evidenceIds.add(definition.id);
      if (
        definition.retention.mode === 'latest' &&
        (!Number.isSafeInteger(definition.retention.limit) ||
          definition.retention.limit <= 0 ||
          definition.retention.timestampField.trim() === '')
      ) {
        errors.push({
          code: 'INVALID_OUTPUT_DEFINITION',
          stepId: step.id,
          message: `Evidence "${definition.id}" requires a positive integer limit and a timestamp field.`,
        });
      }
      if (definition.filter?.field.trim() === '') {
        errors.push({
          code: 'INVALID_OUTPUT_DEFINITION',
          stepId: step.id,
          message: `Evidence "${definition.id}" has an empty filter field.`,
        });
      }
      if (
        definition.type === 'log-sample' &&
        definition.messageFields !== undefined &&
        (definition.messageFields.length === 0 || definition.messageFields.some((field) => field.trim() === ''))
      ) {
        errors.push({
          code: 'INVALID_OUTPUT_DEFINITION',
          stepId: step.id,
          message: `Evidence "${definition.id}" requires non-empty message aliases.`,
        });
      }
    }
  }

  const fieldNames = new Set<string>();
  for (const field of output?.fields ?? []) {
    if (field.name.trim() === '' || field.label.trim() === '' || !/^(vars|params)\..+$/u.test(field.ref)) {
      errors.push({
        code: 'INVALID_OUTPUT_DEFINITION',
        message: `Invalid output field "${field.name}": name, label and vars/params reference are required.`,
      });
    }
    if (fieldNames.has(field.name)) {
      errors.push({ code: 'INVALID_OUTPUT_DEFINITION', message: `Duplicate output field: "${field.name}".` });
    }
    fieldNames.add(field.name);
  }
  return errors;
}
