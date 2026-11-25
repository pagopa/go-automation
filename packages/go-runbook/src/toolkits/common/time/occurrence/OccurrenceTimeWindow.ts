/**
 * Padding applied around an alarm occurrence when collecting diagnostic data.
 *
 * The two sides are independent because the signal that raises an alarm can
 * lag behind the logs that caused it.
 */
export interface OccurrenceTimeWindow {
  /** Minutes included before the first occurrence timestamp. */
  readonly beforeMinutes: number;
  /** Minutes included after the last occurrence timestamp. */
  readonly afterMinutes: number;
}
