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
  /** Optional buffer in seconds around evaluating datapoints (defaults to 0 or alarm period) */
  readonly 'buffer-seconds'?: number | undefined;
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
 * Pattern occurrence count item for global aggregation
 */
export interface PatternFrequencyItem {
  readonly pattern: string;
  readonly count: number;
  readonly percentage: number;
}

/**
 * Report summary for a specific alarm and profile
 */
export interface AlarmOccurrencePatternReport {
  readonly profile: string;
  readonly alarmName: string;
  readonly totalOccurrences: number;
  readonly totalPatternsCount: number;
  readonly occurrences: ReadonlyArray<{
    readonly occurrenceTimestamp: string;
    readonly queryWindow: {
      readonly start: string;
      readonly end: string;
    };
    readonly patternsFound: ReadonlyArray<ExtractedPatternItem>;
  }>;
  readonly patternFrequency: ReadonlyArray<PatternFrequencyItem>;
}
