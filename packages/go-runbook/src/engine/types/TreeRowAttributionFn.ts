import type { EvidenceIdentifier } from './EvidenceIdentifier.js';
import type { TreeRowPredicate } from './TreeRowPredicate.js';

/** The test of the rows of a grouped read that belong to an identifier, made once for each identifier of a batch. */
export type TreeRowAttributionFn = (identifier: EvidenceIdentifier) => TreeRowPredicate;
