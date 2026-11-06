/**
 * Configuration file structure for Go Report Error Patterns
 */
export interface AlarmPatternConfigFile {
  /** Name of the CloudWatch Alarm */
  readonly 'alarm-name': string;
  /** Start timestamp/date string for alarm history search */
  readonly 'alarm-history-start-date': string | number;
  /** End timestamp/date string for alarm history search */
  readonly 'alarm-history-end-date': string | number;
  /** CloudWatch log group used for pattern analysis */
  readonly 'log-group': string;
  /** CloudWatch query string (e.g. pattern analysis query) */
  readonly 'query-aws-cloudwatch': string;
  /** Optional extra seconds to add before and after the analysis window (defaults to 0) */
  readonly 'time-window-extra-seconds'?: number | undefined;
  /** Deprecated alias for time-window-extra-seconds */
  readonly 'buffer-seconds'?: number | undefined;
  /** Optional AWS profile name for this specific alarm */
  readonly 'profile'?: string | undefined;
}

/**
 * Representation of an evaluated alarm occurrence
 */
export interface AlarmOccurrence {
  readonly timestamp: Date;
  readonly historySummary?: string | undefined;
  readonly queryStartTime: Date;
  readonly queryEndTime: Date;
  readonly evaluatingDatapointTimestamps: ReadonlyArray<Date>;
}

/**
 * Represents the extracted fields of a single pattern found in an occurrence
 */
export interface ExtractedPatternItem {
  readonly pattern: string;
  readonly ratio?: number | string | undefined;
  readonly sampleCount?: number | undefined;
}

/**
 * Single occurrence query result containing the occurrence and the extracted patterns
 */
export interface OccurrenceQueryResult {
  readonly occurrence: AlarmOccurrence;
  readonly patterns: ReadonlyArray<ExtractedPatternItem>;
}

/**
 * Dominant pattern entry in Report A
 */
export interface DominantPatternItem {
  readonly pattern: string;
  readonly count: number;
  readonly percentage: number;
  readonly hasTies: boolean;
}

/**
 * Aggregation result for dominant patterns
 */
export interface DominantPatternAggregation {
  readonly totalOccurrences: number;
  readonly occurrencesWithPatterns: number;
  readonly occurrencesWithoutPatterns: number;
  readonly dominantPatterns: ReadonlyArray<DominantPatternItem>;
}

/**
 * Report A: Dominant Pattern Report
 */
export interface DominantPatternReport {
  readonly reportType: 'dominant-pattern';
  readonly description: string;
  readonly profile: string;
  readonly alarmName: string;
  readonly totalOccurrences: number;
  readonly occurrencesWithPatterns: number;
  readonly occurrencesWithoutPatterns: number;
  readonly dominantPatterns: ReadonlyArray<DominantPatternItem>;
}

/**
 * Pattern coverage entry in Report B
 */
export interface PatternCoverageItem {
  readonly pattern: string;
  readonly count: number;
  readonly percentage: number;
}

/**
 * Aggregation result for pattern coverage
 */
export interface PatternCoverageAggregation {
  readonly totalOccurrences: number;
  readonly occurrencesWithPatterns: number;
  readonly occurrencesWithoutPatterns: number;
  readonly patternCoverage: ReadonlyArray<PatternCoverageItem>;
}

/**
 * Report B: Pattern Coverage Report
 */
export interface PatternCoverageReport {
  readonly reportType: 'pattern-coverage';
  readonly description: string;
  readonly profile: string;
  readonly alarmName: string;
  readonly totalOccurrences: number;
  readonly occurrencesWithPatterns: number;
  readonly occurrencesWithoutPatterns: number;
  readonly patternCoverage: ReadonlyArray<PatternCoverageItem>;
}

/**
 * Tied pattern combination entry in Report C
 */
export interface TiedPatternCombinationItem {
  readonly patterns: ReadonlyArray<string>;
  readonly count: number;
  readonly percentage: number;
}

/**
 * Aggregation result for tied pattern combinations
 */
export interface TiedCombinationAggregation {
  readonly totalOccurrences: number;
  readonly message: string | null;
  readonly tiedCombinations: ReadonlyArray<TiedPatternCombinationItem>;
}

/**
 * Report C: Tied Pattern Combinations Report
 */
export interface TiedPatternCombinationsReport {
  readonly reportType: 'tied-pattern-combinations';
  readonly description: string;
  readonly profile: string;
  readonly alarmName: string;
  readonly totalOccurrences: number;
  readonly message: string | null;
  readonly tiedCombinations: ReadonlyArray<TiedPatternCombinationItem>;
}
