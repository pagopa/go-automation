import type { ResultField } from '@go-automation/go-common/aws';

import type { AccessLogSchema } from '../profiles/schemas/AccessLogSchema.js';
import { extractCwField } from './extractCwField.js';

/**
 * Helpers shared by the API Gateway AccessLog consumers
 * (`ParseApiGwErrorsStep`, `QueryApiGwExecutionLogsStep`).
 *
 * All routines are schema-driven: they read the configured `statusFields`,
 * `notApplicableSentinels`, `fieldToVar` mappings from the supplied
 * {@link AccessLogSchema} so that SEND / INTEROP profiles share the same
 * implementation.
 */

/**
 * Returns `true` when at least one of the schema-declared status fields
 * parses to a number ≥ `minStatusCode`. Values matching the schema's
 * `notApplicableSentinels` (typically `'-'`) are skipped.
 */
export function rowMeetsThreshold(
  row: ReadonlyArray<ResultField>,
  minStatusCode: number,
  schema: AccessLogSchema,
): boolean {
  for (const field of schema.statusFields) {
    const raw = extractCwField(row, field);
    if (raw === undefined) continue;
    if (schema.notApplicableSentinels.includes(raw)) continue;
    const num = Number(raw);
    if (!Number.isNaN(num) && num >= minStatusCode) {
      return true;
    }
  }
  return false;
}

/**
 * Returns the first numeric value among the configured status fields, in
 * declaration order. Used to populate `apiGwStatusCode` so consumers see a
 * meaningful code even when the row's error signal is on a secondary
 * field (`authorizerStatus`, `integrationServiceStatus`).
 */
export function pickPrimaryStatusCode(row: ReadonlyArray<ResultField>, schema: AccessLogSchema): string {
  for (const field of schema.statusFields) {
    const raw = extractCwField(row, field);
    if (raw === undefined) continue;
    if (schema.notApplicableSentinels.includes(raw)) continue;
    if (!Number.isNaN(Number(raw))) {
      return raw;
    }
  }
  return '';
}

/**
 * Returns the highest numeric status value found on the schema-declared
 * status fields. Used only for row prioritisation: the typed output still
 * uses {@link pickPrimaryStatusCode}, which preserves the schema's
 * canonical field precedence.
 */
export function pickHighestStatusCode(row: ReadonlyArray<ResultField>, schema: AccessLogSchema): number | undefined {
  let highest: number | undefined;
  for (const field of schema.statusFields) {
    const raw = extractCwField(row, field);
    if (raw === undefined) continue;
    if (schema.notApplicableSentinels.includes(raw)) continue;
    const num = Number(raw);
    if (Number.isNaN(num)) continue;
    if (highest === undefined || num > highest) {
      highest = num;
    }
  }
  return highest;
}

/**
 * Trims an AccessLog field value and returns the empty string when the
 * trimmed value matches one of the schema sentinels (typically `'-'`).
 */
export function sanitizeApiGwField(raw: string | undefined, schema: AccessLogSchema): string {
  const trimmed = (raw ?? '').trim();
  if (schema.notApplicableSentinels.includes(trimmed)) return '';
  return trimmed;
}

/**
 * Builds the canonical `apiGw*` vars from an AccessLog row.
 *
 * Includes `apiGwErrorCount` and `apiGwStatusCode` plus every field
 * declared by the schema's `fieldToVar` mapping (e.g. `errorMessage` →
 * `apiGwErrorMessage`, `httpMethod` → `apiGwHttpMethod`).
 */
export function buildApiGwVars(
  row: ReadonlyArray<ResultField>,
  errorCount: number,
  schema: AccessLogSchema,
): Record<string, string> {
  const vars: Record<string, string> = {
    apiGwErrorCount: String(errorCount),
    apiGwStatusCode: pickPrimaryStatusCode(row, schema),
  };
  for (const [field, contextVar] of schema.fieldToVar) {
    const raw = extractCwField(row, field);
    if (raw !== undefined) {
      vars[contextVar] = raw;
    }
  }
  return vars;
}
