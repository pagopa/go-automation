import type { KnownErrorAnalysis } from '../KnownErrorAnalysis.js';

export type AnalysisReferences = Pick<KnownErrorAnalysis, 'resources' | 'downstreams' | 'finalActions' | 'links'>;
