import type { KnownCaseAnalysisDraft } from './KnownCaseAnalysisDraft.js';
import type { UnknownCaseContextDraft } from './UnknownCaseContextDraft.js';

/**
 * Versioned discriminated union of the analysis draft carried by the completion
 * callback. `kind` selects the branch, `schemaVersion` gates the contract.
 */
export type AnalysisDraftV1 = KnownCaseAnalysisDraft | UnknownCaseContextDraft;
