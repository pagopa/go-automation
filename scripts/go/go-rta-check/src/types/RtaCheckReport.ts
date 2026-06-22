/**
 * Result types for go-rta-check — the comparison report contract.
 * Cohesive module; intentionally not split per type.
 */

import type { ClassifiedRunbookCheck, RunbookCheckStatus } from '@go-automation/go-runbook';

/** V1 (runbook coverage) outcome for one executed occurrence. */
export type V1Status = Exclude<RunbookCheckStatus, 'NO_RUNBOOK'>;

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

/** Effective source that produced a single V2 comparison row. */
export type AnalysisMatchSource = AnalysisMatcherKind | 'deterministic' | 'deterministic+ai';

/** Semantic verdict returned by GO-AI. */
type AnalysisSemanticVerdict = 'equivalent' | 'conflicting';

/** Outcome of running the runbook for one occurrence (V1). */
export type RunbookCheck = ClassifiedRunbookCheck;

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
  /** Effective source used to compute or preserve this V2 result. */
  readonly matcher?: AnalysisMatchSource;
  /** True when the AI matcher was attempted for this comparison. */
  readonly aiAttempted?: boolean;
  /** True when the AI matcher failed and the lexical matcher was used instead. */
  readonly aiFallback?: boolean;
  /** Error returned by the AI matcher, if any. */
  readonly aiError?: string;
  /** GO-AI explanation when a semantic audit/result is available. */
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
