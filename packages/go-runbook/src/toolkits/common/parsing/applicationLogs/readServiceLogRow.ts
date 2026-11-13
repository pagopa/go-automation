import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { ERROR_KEYWORDS } from './ERROR_KEYWORDS.js';
import { readServiceLogMessage } from './readServiceLogMessage.js';
import type { ServiceLogRow } from './ServiceLogRow.js';
import type { ServiceLogSchema } from './ServiceLogSchema.js';

/**
 * Reads an application log row once: a field map (the first value of a name
 * wins; a field needs both name and value), the message and the level signals.
 *
 * @param row - CloudWatch Logs Insights result row
 * @param schema - Schema of the application logs
 * @returns The row, ready for the scanner policies
 */
export function readServiceLogRow(
  row: ReadonlyArray<GOLogsInsightsResultField>,
  schema: ServiceLogSchema,
): ServiceLogRow {
  const fields = new Map<string, string>();
  for (const field of row) {
    if (field.field !== undefined && field.value !== undefined && !fields.has(field.field)) {
      fields.set(field.field, field.value);
    }
  }
  const message = readServiceLogMessage(fields, schema);
  const level = (fields.get(schema.levelField) ?? '').toLowerCase();
  return {
    fields,
    message,
    level,
    isErrorLevel: level.includes('error') || level.includes('warn'),
    hasErrorKeyword: ERROR_KEYWORDS.some((keyword) => message.includes(keyword)),
  };
}
