/**
 * Read-only application library that runs, compares and verifies the coverage of
 * the runbooks against Watchtower data.
 *
 * It never prompts, renders, writes files or terminates the process: progress and
 * storage enter through ports, so the CLI stays a thin adapter.
 */
export { checkOccurrence } from './check/checkOccurrence.js';
export type { CheckOccurrenceInput, RunbookCheckContext } from './check/checkOccurrence.js';
export { checkOccurrences } from './check/checkOccurrences.js';
export type { CheckOccurrencesInput } from './check/checkOccurrences.js';

export { matchAnalysis } from './comparison/matchAnalysis.js';
export type { MatchAnalysisOptions } from './comparison/matchAnalysis.js';
export { matchAnalysisAi } from './comparison/matchAnalysisAi.js';
export type { MatchAnalysisAiOptions } from './comparison/matchAnalysisAi.js';
export type { AnalysisMatcherFn } from './comparison/AnalysisMatcher.js';

export { resolveRunbookCacheDescriptor } from './cache/runbookFingerprint.js';
export { runbookCheckCacheKey } from './cache/RunbookCheckCache.js';
export type { RunbookCheckCache } from './cache/RunbookCheckCache.js';
export type { CachedRunbookMeta } from './cache/CachedRunbookMeta.js';
export type { CachedRunbookOutput } from './cache/CachedRunbookOutput.js';
export type { RunbookCacheDescriptor } from './cache/RunbookCacheDescriptor.js';

export { checkRunbookCoverage } from './coverage/checkRunbookCoverage.js';
export type { RunbookCoverageInput } from './coverage/checkRunbookCoverage.js';
export { COVERAGE_ERROR_CODES, COVERAGE_WARNING_CODES } from './coverage/CoverageIssue.js';
export type { CoverageIssue, CoverageIssueCode } from './coverage/CoverageIssue.js';
export type { CoverageReport } from './coverage/CoverageReport.js';

export type { CheckProgressEvent, CheckProgressHandler } from './types/CheckProgressEvent.js';
export type {
  AnalysisMatch,
  AnalysisMatcherKind,
  AnalysisMatchSignals,
  AnalysisMatchSource,
  RtaCheckEvent,
  RtaCheckInput,
  RtaCheckReport,
  RtaCheckRow,
  RtaCheckSummary,
  RunbookCheck,
  V1Status,
  V2Status,
} from './types/RtaCheckReport.js';
