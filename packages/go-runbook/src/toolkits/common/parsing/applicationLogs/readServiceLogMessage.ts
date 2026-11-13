import type { ServiceLogSchema } from './ServiceLogSchema.js';

/**
 * Reads the message of an application log row from the first non-empty field
 * among the schema's message candidates.
 *
 * @param fields - Fields of the row, first value per name
 * @param schema - Schema of the application logs
 * @returns The trimmed message, or `''`
 */
export function readServiceLogMessage(fields: ReadonlyMap<string, string>, schema: ServiceLogSchema): string {
  for (const candidate of schema.messageFieldCandidates) {
    const value = fields.get(candidate);
    if (value !== undefined) return value;
  }
  return '';
}
