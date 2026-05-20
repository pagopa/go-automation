import type { ResultField } from '@go-automation/go-common/aws';

import type { ServiceLogSchema } from '../profiles/schemas/ServiceLogSchema.js';
import { extractCwField } from './extractCwField.js';

/**
 * Returns the value of the first message field declared by `schema.messageFieldCandidates`
 * that is present on the row. Returns the empty string when no candidate matches.
 *
 * SEND reads `message` then `@message`; an INTEROP-style profile could
 * restrict to `['@message']`. Centralising this lookup avoids the
 * duplication of the same loop across the apigw helpers.
 */
export function readMessageField(row: ReadonlyArray<ResultField>, schema: ServiceLogSchema): string {
  for (const candidate of schema.messageFieldCandidates) {
    const value = extractCwField(row, candidate);
    if (value !== undefined) return value;
  }
  return '';
}
