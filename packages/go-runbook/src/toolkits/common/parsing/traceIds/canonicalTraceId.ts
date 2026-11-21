import { bareTraceId } from './bareTraceId.js';
import { readXrayHeaderRoot } from './readXrayHeaderRoot.js';

/**
 * The canonical X-Ray form of a trace id, in lowercase: a direct X-Ray or compact id, otherwise the `Root=` of an
 * X-Ray header. The same trace written in either form or case gives the same id.
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
  const value = raw.trim();
  return bareTraceId(value) ?? readXrayHeaderRoot(value)?.toLowerCase();
}
