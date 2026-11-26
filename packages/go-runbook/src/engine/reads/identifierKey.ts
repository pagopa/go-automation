import type { EvidenceIdentifier } from '../types/EvidenceIdentifier.js';

/**
 * The key of an identifier: two identifiers with the same kind and value have the same key.
 *
 * @param identifier - Identifier
 * @returns `<kind>:<value>`
 *
 * @example
 * ```typescript
 * identifierKey({ kind: 'requestId', value: 'a1b2' }); // 'requestId:a1b2'
 * ```
 */
export function identifierKey(identifier: EvidenceIdentifier): string {
  return `${identifier.kind}:${identifier.value}`;
}
