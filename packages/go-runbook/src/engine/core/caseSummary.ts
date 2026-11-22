import type { KnownCaseDetection } from '../types/KnownCaseDetection.js';

/**
 * The distinct cases of the detections, in the order they were first detected, each with its count when it was
 * detected more than once.
 *
 * @param detections - Detections of an execution
 * @returns The summary, `none` without detections
 *
 * @example
 * ```typescript
 * caseSummary(detections); // 'inad-connect-timeout ×51, inad-unknown-error'
 * ```
 */
export function caseSummary(detections: ReadonlyArray<KnownCaseDetection>): string {
  if (detections.length === 0) return 'none';
  const counts = new Map<string, number>();
  for (const { knownCase } of detections) counts.set(knownCase.id, (counts.get(knownCase.id) ?? 0) + 1);
  return [...counts].map(([id, count]) => (count > 1 ? `${id} ×${String(count)}` : id)).join(', ');
}
