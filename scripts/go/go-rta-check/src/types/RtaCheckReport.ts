/**
 * Result types for go-rta-check — the comparison report contract.
 * Cohesive module; intentionally not split per type.
 */

/** V1 (runbook coverage) outcome for one occurrence. */
export type V1Status = 'HIT' | 'MISS' | 'NO-DATA' | 'CONFIG-ERROR' | 'EXECUTION-ERROR';

/** V2 (analysis agreement) outcome for one occurrence. */
export type V2Status =
  | 'MATCH_EXACT'
  | 'MATCH_STRONG'
  | 'MATCH_WEAK'
  | 'NO_EVIDENCE'
  | 'CONFLICT'
  | 'NOT_LINKED'
  | 'NOT_ANALYZED';

/** Engine used for the V2 comparison. */
export type AnalysisMatcherKind = 'lexical' | 'ai';

/** Semantic verdict returned by GO-AI. */
type AnalysisSemanticVerdict = 'equivalent' | 'conflicting';

/** Outcome of running the runbook for one occurrence (V1). */
export interface RunbookCheck {
  readonly status: V1Status;
  readonly outcomeKind?: string;
  readonly primaryCaseId?: string;
  readonly primaryCaseDescription?: string;
  readonly matchedCaseIds: ReadonlyArray<string>;
  readonly durationMs?: number;
  readonly cloudWatchRecordsScanned?: number;
  readonly cloudWatchBytesScanned?: number;
  /** Original error message when status is CONFIG-ERROR / EXECUTION-ERROR. */
  readonly error?: string;
}

/** Transparent per-signal breakdown of the V2 comparison. */
export interface AnalysisMatchSignals {
  readonly caseIdMentioned: boolean;
  readonly descriptionOverlap: number;
  readonly traceIdOverlap: ReadonlyArray<string>;
  readonly downstreamOverlap: ReadonlyArray<string>;
  readonly errorKeywordOverlap: ReadonlyArray<string>;
  readonly semanticScore?: number;
  readonly semanticVerdict?: AnalysisSemanticVerdict;
}

/** Outcome of comparing the runbook case with the Watchtower analysis (V2). */
export interface AnalysisMatch {
  readonly status: V2Status;
  readonly confidence: number;
  readonly reasons: ReadonlyArray<string>;
  readonly signals: AnalysisMatchSignals;
  /** Final matcher used to compute V2. */
  readonly matcher?: AnalysisMatcherKind;
  /** True when the AI matcher was attempted for this comparison. */
  readonly aiAttempted?: boolean;
  /** True when the AI matcher failed and the lexical matcher was used instead. */
  readonly aiFallback?: boolean;
  /** Error returned by the AI matcher, if any. */
  readonly aiError?: string;
  /** GO-AI explanation when `matcher` is `ai`. */
  readonly semanticExplanation?: string;
  /** Reference text from the analysis (trackingEntry or aggregate), for side-by-side. */
  readonly analysisExcerpt?: string;
}

/** Occurrence event info embedded in a row. */
export interface RtaCheckEvent {
  readonly id: string;
  readonly firedAt: string;
  readonly awsAccountId: string;
  readonly awsRegion: string;
  readonly environment?: string;
  readonly analysisId?: string;
}

/** One occurrence row: event + V1 + V2. */
export interface RtaCheckRow {
  readonly event: RtaCheckEvent;
  readonly runbook: RunbookCheck;
  readonly comparison: AnalysisMatch;
  /** True when the runbook result was reused from the resume cache. */
  readonly fromCache: boolean;
}

/** Aggregate metrics over all occurrences. */
export interface RtaCheckSummary {
  readonly totalEvents: number;
  readonly executedEvents: number;
  readonly linkedAnalyses: number;
  readonly hit: number;
  readonly miss: number;
  readonly noData: number;
  readonly configError: number;
  readonly executionError: number;
  /** HIT / (HIT + MISS). */
  readonly automationCoveragePct: number;
  /** (HIT + MISS) / total. */
  readonly executableRatePct: number;
  /** CONFIG-ERROR / total. */
  readonly configErrorRatePct: number;
  readonly avgDurationMs: number;
  readonly cloudWatchRecordsScanned: number;
  readonly analysisCompatibility: Readonly<Record<V2Status, number>>;
}

/** Static inputs of a run, embedded in the report. */
export interface RtaCheckInput {
  readonly watchtowerUrl: string;
  readonly productId: string;
  readonly productName: string;
  /** Selected environment name, or "tutti gli ambienti" when not filtered. */
  readonly environmentName?: string;
  readonly alarmId: string;
  readonly alarmName: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly awsProfiles: ReadonlyArray<string>;
  /** V2 matcher selected for this run. */
  readonly analysisMatcher?: AnalysisMatcherKind;
  /** Semantic equivalence threshold when `analysisMatcher` is `ai`. */
  readonly goAiSemanticThreshold?: number;
}

/** Full machine-readable report. */
export interface RtaCheckReport {
  readonly schemaVersion: '1.0.0';
  readonly generatedAt: string;
  readonly input: RtaCheckInput;
  readonly summary: RtaCheckSummary;
  readonly rows: ReadonlyArray<RtaCheckRow>;
}
