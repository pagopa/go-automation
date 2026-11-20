import { readXrayHeaderRoot } from './readXrayHeaderRoot.js';
import { transformRawTraceId } from './transformRawTraceId.js';

/**
 * The canonical X-Ray form of a trace id: a raw 32-hex id, an X-Ray id or the `Root=` of an X-Ray header.
 *
 * @param raw - Trace id as found in a log
 * @returns The canonical trace id, or nothing when the value is not one
 *
 * @example
 * ```typescript
 * canonicalTraceId('Root=1-67891234-abcdef012345678912345678;Sampled=1'); // '1-67891234-abcdef012345678912345678'
 * ```
 */
export function canonicalTraceId(raw: string): string | undefined {
  return transformRawTraceId(raw) ?? readXrayHeaderRoot(raw);
}
