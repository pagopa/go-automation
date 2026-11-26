import type { EvidenceIdentifierKind } from '../../../../engine/index.js';

/** The correlation keys of a node that are identifiers, with their kind. */
export const CORRELATION_KINDS: ReadonlyMap<string, EvidenceIdentifierKind> = new Map([
  ['requestId', 'requestId'],
  ['traceId', 'traceId'],
  ['fallbackUuid', 'fallbackUuid'],
]);
