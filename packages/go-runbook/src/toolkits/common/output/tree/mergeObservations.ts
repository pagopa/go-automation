import type { IdentifierObservation } from '../../../../engine/index.js';
import { identifierKey } from '../../../../engine/internal.js';
import { isEarlier } from '../isEarlier.js';

/**
 * One observation per kind and value: the earliest one, an observation without a time losing to one with a time and
 * the first one offered winning a tie. The result is in time order, observations without a time last.
 *
 * Complexity: O(N log N) over the candidates.
 *
 * @param candidates - Observations in the order they are offered
 * @returns The merged observations
 *
 * @example
 * ```typescript
 * mergeObservations([{ kind: 'requestId', value: 'r1', observedAt: '2026-01-01T00:01:00Z' },
 *   { kind: 'requestId', value: 'r1', observedAt: '2026-01-01T00:00:00Z' }]); // the second one
 * ```
 */
export function mergeObservations(candidates: Iterable<IdentifierObservation>): ReadonlyArray<IdentifierObservation> {
  const merged = new Map<string, IdentifierObservation>();
  for (const observation of candidates) {
    const key = identifierKey(observation);
    const previous = merged.get(key);
    if (previous === undefined || isEarlier(observation.observedAt, previous.observedAt)) merged.set(key, observation);
  }
  return [...merged.values()].sort((a, b) =>
    isEarlier(a.observedAt, b.observedAt) ? -1 : isEarlier(b.observedAt, a.observedAt) ? 1 : 0,
  );
}
