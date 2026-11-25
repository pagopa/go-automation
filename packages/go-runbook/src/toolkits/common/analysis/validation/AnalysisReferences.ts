import type { KnownCaseAnalysis } from '../KnownCaseAnalysis.js';

export type AnalysisReferences = Pick<KnownCaseAnalysis, 'resources' | 'downstreams' | 'finalActions' | 'links'>;
