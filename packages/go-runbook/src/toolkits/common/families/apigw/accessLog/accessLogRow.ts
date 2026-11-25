import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { AccessLogSchema } from './AccessLogSchema.js';
import type { CloudWatchLogsRow } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';

/**
 * Helpers shared by the API Gateway AccessLog consumers
 * (`ParseApiGwErrorsStep`, `QueryApiGwExecutionLogsStep`, `EvaluateApiGwAuthorizerFailureStep`).
 *
 * All routines are schema-driven: they read the configured `statusFields`,
 * `notApplicableSentinels`, `fieldToVar` mappings from the supplied
 * {@link AccessLogSchema} so that SEND / INTEROP profiles share the same
 * implementation.
 */

/**
 * The value of an AccessLog field, trimmed; nothing when the field is missing, blank or one of the schema sentinels
 * (typically `'-'`, what API Gateway writes for a value it did not capture).
 *
 * @param row - AccessLog row
 * @param field - Field name
 * @param schema - Schema with the sentinels of the profile
 * @returns The value, or `undefined` when it carries no content
 *
 * @example
 * ```typescript
 * readAccessLogField([{ field: 'path', value: '-' }], 'path', schema); // undefined
 * ```
 */
export function readAccessLogField(row: CloudWatchLogsRow, field: string, schema: AccessLogSchema): string | undefined {
  const trimmed = (readRowField(row, field) ?? '').trim();
  if (trimmed === '' || schema.notApplicableSentinels.includes(trimmed)) return undefined;
  return trimmed;
}

/**
 * The numeric values of the schema-declared status fields, in declaration order, with their raw text. Values matching
 * the schema's `notApplicableSentinels` and values that are not numbers are skipped.
 */
function* statusCodes(
  row: CloudWatchLogsRow,
  schema: AccessLogSchema,
): Generator<readonly [raw: string, code: number]> {
  for (const field of schema.statusFields) {
    const raw = readRowField(row, field);
    if (raw === undefined || schema.notApplicableSentinels.includes(raw)) continue;
    const code = Number(raw);
    if (!Number.isNaN(code)) yield [raw, code];
  }
}

/**
 * Returns `true` when at least one of the schema-declared status fields
 * parses to a number ≥ `minStatusCode`. Values matching the schema's
 * `notApplicableSentinels` (typically `'-'`) are skipped.
 */
export function rowMeetsThreshold(row: CloudWatchLogsRow, minStatusCode: number, schema: AccessLogSchema): boolean {
  for (const [, code] of statusCodes(row, schema)) {
    if (code >= minStatusCode) return true;
  }
  return false;
}

/**
 * Returns the first numeric value among the configured status fields, in
 * declaration order. Used to populate `apiGwStatusCode` so consumers see a
 * meaningful code even when the row's error signal is on a secondary
 * field (`authorizerStatus`, `integrationServiceStatus`).
 */
export function pickPrimaryStatusCode(row: CloudWatchLogsRow, schema: AccessLogSchema): string {
  for (const [raw] of statusCodes(row, schema)) return raw;
  return '';
}

/**
 * Returns the highest numeric status value found on the schema-declared
 * status fields. Used only for row prioritisation: the typed output still
 * uses {@link pickPrimaryStatusCode}, which preserves the schema's
 * canonical field precedence.
 */
export function pickHighestStatusCode(row: CloudWatchLogsRow, schema: AccessLogSchema): number | undefined {
  let highest: number | undefined;
  for (const [, code] of statusCodes(row, schema)) {
    if (highest === undefined || code > highest) highest = code;
  }
  return highest;
}
