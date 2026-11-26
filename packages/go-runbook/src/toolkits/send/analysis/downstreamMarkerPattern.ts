import type { DownstreamMarkerParts } from './DownstreamMarkerParts.js';

const REGEX_SYNTAX = /[.*+?^${}()|[\]\\]/gu;

function escapeRegexLiteral(value: string): string {
  return value.replace(REGEX_SYNTAX, '\\$&');
}

/**
 * The regular expression of the `[DOWNSTREAM] Service <service> returned errors=` marker the SEND services write
 * when a downstream call fails, followed by the status, the method and the endpoint of the call when they are given:
 * `… errors=<status> from <method> <endpoint>`. Service and endpoint are escaped; whatever follows them is appended by
 * the caller.
 *
 * @param service - Downstream name written after `Service`
 * @param parts - Status, method and endpoint of the failed call
 * @returns The pattern, for a step evidence condition
 *
 * @example
 * ```typescript
 * downstreamMarkerPattern('AdE', { status: '500 Internal Server Error', method: 'POST', endpoint: 'https://ade.it/ws' });
 * // '\\[DOWNSTREAM\\] Service AdE returned errors=500 Internal Server Error from POST https://ade\\.it/ws'
 * ```
 */
export function downstreamMarkerPattern(service: string, parts: DownstreamMarkerParts = {}): string {
  const method = parts.method === undefined ? '' : ` from ${parts.method}`;
  const endpoint = parts.endpoint === undefined ? '' : ` ${escapeRegexLiteral(parts.endpoint)}`;
  return `\\[DOWNSTREAM\\] Service ${escapeRegexLiteral(service)} returned errors=${parts.status ?? ''}${method}${endpoint}`;
}
