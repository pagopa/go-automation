import type { KnownErrorAnalysisDraft } from './KnownErrorAnalysisDraft.js';
import type { UnknownErrorContextDraft } from './UnknownErrorContextDraft.js';

/**
 * Versioned discriminated union of the analysis draft carried by the completion
 * callback. `kind` selects the branch, `schemaVersion` gates the contract.
 */
export type AnalysisDraftV1 = KnownErrorAnalysisDraft | UnknownErrorContextDraft;
