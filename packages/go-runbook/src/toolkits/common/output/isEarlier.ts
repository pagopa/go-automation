/**
 * Whether an ISO time comes before another: an untimed one never does, and any timed one precedes an untimed one.
 *
 * @param candidate - Time to compare
 * @param other - Time it is compared with
 * @returns `true` when `candidate` comes first
 *
 * @example
 * ```typescript
 * isEarlier('2026-01-01T00:00:00Z', undefined); // true
 * ```
 */
export function isEarlier(candidate: string | undefined, other: string | undefined): boolean {
  if (candidate === undefined) return false;
  if (other === undefined) return true;
  return Date.parse(candidate) < Date.parse(other);
}
