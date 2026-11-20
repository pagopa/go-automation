import type { TimedEvidenceIdentifier } from './TimedEvidenceIdentifier.js';

/** What an evidence element says about time and identity. */
export interface EvidenceTime {
  /** Earliest instant of the element, epoch milliseconds; absent when the element has identifiers but no time. */
  readonly first?: number;
  /** Latest instant of the element, epoch milliseconds; present exactly when `first` is. */
  readonly last?: number;
  /** Rows the element stands for: 1 for a plain row, `count` for an aggregate row. */
  readonly weight: number;
  /**
   * Typed identifiers carried by the element, each with its own instant: in an aggregate the identifier kept by
   * `latest(...)` belongs to the latest row, in a combination of rows each identifier keeps the time of its row.
   */
  readonly identifiers?: ReadonlyArray<TimedEvidenceIdentifier>;
}
