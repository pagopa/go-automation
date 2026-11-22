import type { EvidenceIdentifier } from '../types/EvidenceIdentifier.js';
import { isRequestId } from './isRequestId.js';
import { safeCorrelationValue } from './safeCorrelationValue.js';

/**
 * An identifier in the canonical form of its kind, or nothing when it is not a valid one: a request id follows the
 * rule of the request ids, the other kinds the rule of the correlation of the nodes.
 *
 * @param identifier - Identifier to check
 * @returns The trimmed identifier, or nothing
 *
 * @example
 * ```typescript
 * canonicalReadIdentifier({ kind: 'requestId', value: ' a1b2 ' }); // { kind: 'requestId', value: 'a1b2' }
 * canonicalReadIdentifier({ kind: 'requestId', value: 'req.42' }); // undefined
 * ```
 */
export function canonicalReadIdentifier(identifier: EvidenceIdentifier): EvidenceIdentifier | undefined {
  const value = identifier.kind === 'requestId' ? identifier.value.trim() : safeCorrelationValue(identifier.value);
  if (value === undefined || (identifier.kind === 'requestId' && !isRequestId(value))) return undefined;
  return { kind: identifier.kind, value };
}
