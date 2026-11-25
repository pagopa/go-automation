import type { CoverageReason, StepCoverage } from '../../../engine/index.js';

/**
 * The incomplete sources of some coverage entries, counted by reason in the order the reasons first appear; an entry
 * without a reason counts as `unavailable`.
 *
 * @param entries - Coverage entries
 * @returns The count of each reason
 *
 * @example
 * ```typescript
 * countCoverageByReason([{ complete: false, reason: 'saturated' }, { complete: false }]);
 * // Map { 'saturated' => 1, 'unavailable' => 1 }
 * ```
 */
export function countCoverageByReason(
  entries: ReadonlyArray<Pick<StepCoverage, 'reason'>>,
): ReadonlyMap<CoverageReason, number> {
  const counts = new Map<CoverageReason, number>();
  for (const entry of entries) {
    const reason = entry.reason ?? 'unavailable';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return counts;
}
