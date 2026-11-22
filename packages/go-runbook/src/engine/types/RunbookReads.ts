import type { EvidenceIdentifier } from './EvidenceIdentifier.js';
import type { ReadState } from './ReadState.js';

/**
 * The state of the reads seen from a context: the gaps of its scope and of the scopes it descends from.
 *
 * - `stateOf` is the most severe gap of the read of a step, `queried` without gaps; for an identifier, only the gaps
 *   that name it and those of the whole read count.
 * - `isComplete` says whether the read of a step has no gap at all.
 * - `hasGapFor` says whether a gap of the read of a step names the identifier: a gap of the whole read does not.
 */
export interface RunbookReads {
  stateOf(stepId: string, identifier?: EvidenceIdentifier): ReadState;
  isComplete(stepId: string): boolean;
  hasGapFor(stepId: string, identifier: EvidenceIdentifier): boolean;
}
