import type { CoverageReason } from './CoverageReason.js';
import type { ReadIdentifier } from './ReadIdentifier.js';

/**
 * What a step declares when it did not see all the evidence it should have.
 *
 * A step that saturates a query, cannot read a source, skips a read or relies on a manual correlation says so in its
 * result instead of throwing or staying silent. Missing coverage means "complete". A gap with `identifiers` concerns
 * only those identifiers; without them, or with an empty list, it concerns the whole read. A new read returns new
 * entries: returning the same entry object again means sharing the same read.
 */
export interface StepCoverage {
  /** Safe label of the source (logical account, log group, batch); never a local AWS profile name. */
  readonly source?: string;
  /** `false` when the evidence of this source is partial. */
  readonly complete: boolean;
  /**
   * - `saturated`: rows equal to the query limit, or unread pages;
   * - `unavailable`: the source could not be read;
   * - `skipped`: the read was not attempted, or elements were dropped;
   * - `manual`: the correlation is not automatic.
   */
  readonly reason?: CoverageReason;
  /** At most 200 characters, scrubbed of local profile names; never part of the analysis draft. */
  readonly detail?: string;
  readonly identifiers?: ReadonlyArray<ReadIdentifier>;
}
