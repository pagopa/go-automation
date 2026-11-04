import {
  AWSCloudWatchLogsService,
  readRowField,
  type ResultField,
  type AWSCloudWatchLogsQueryOptions,
} from '@go-automation/go-common/aws';
import type {
  AlarmOccurrence,
  ExtractedPatternItem,
  PatternFrequencyItem,
} from '../types/PatternTypes.js';

export interface OccurrenceQueryResult {
  readonly occurrence: AlarmOccurrence;
  readonly patterns: ReadonlyArray<ExtractedPatternItem>;
}

/**
 * Extracts ratio, sampleCount, and pattern from a CloudWatch Logs Insights result row.
 * Handles both named fields (@ratio, @sampleCount, @pattern) and positional indices
 * (1 for ratio, 5 for sampleCount, 8 for pattern).
 */
export function extractPatternFromRow(row: ReadonlyArray<ResultField>): ExtractedPatternItem | null {
  // Pattern field: @pattern or index 8 (0-based: 7 or 8 depending on index offset)
  const patternVal =
    readRowField(row, '@pattern') ??
    readRowField(row, 'pattern') ??
    readRowField(row, '@message') ??
    readRowField(row, 'message') ??
    (row[7]?.value !== undefined ? row[7].value : undefined) ??
    (row[8]?.value !== undefined ? row[8].value : undefined);

  if (!patternVal) {
    return null;
  }

  // Ratio field: @ratio or index 1 (0-based: 0 or 1)
  const rawRatio =
    readRowField(row, '@ratio') ??
    readRowField(row, 'ratio') ??
    (row[0]?.value !== undefined && !isNaN(Number(row[0].value)) ? row[0].value : undefined) ??
    (row[1]?.value !== undefined && !isNaN(Number(row[1].value)) ? row[1].value : undefined);

  // SampleCount field: @sampleCount or index 5 (0-based: 4 or 5)
  const rawSampleCount =
    readRowField(row, '@sampleCount') ??
    readRowField(row, 'sampleCount') ??
    readRowField(row, '@count') ??
    readRowField(row, 'count') ??
    (row[4]?.value !== undefined && !isNaN(Number(row[4].value)) ? row[4].value : undefined) ??
    (row[5]?.value !== undefined && !isNaN(Number(row[5].value)) ? row[5].value : undefined);

  const ratio = rawRatio !== undefined ? (isNaN(Number(rawRatio)) ? rawRatio : Number(rawRatio)) : undefined;
  const sampleCount = rawSampleCount !== undefined ? Number(rawSampleCount) : undefined;

  return {
    pattern: patternVal,
    ratio,
    sampleCount,
  };
}

/**
 * Queries pattern analysis for a single alarm occurrence.
 */
export async function queryPatternsForOccurrence(
  logsService: AWSCloudWatchLogsService,
  logGroup: string,
  queryString: string,
  occurrence: AlarmOccurrence,
  signal?: AbortSignal,
): Promise<OccurrenceQueryResult> {
  const timeRange = {
    start: occurrence.queryStartTime,
    end: occurrence.queryEndTime,
  };

  const options: AWSCloudWatchLogsQueryOptions = signal === undefined ? {} : { signal };
  const rows = await logsService.query([logGroup], queryString, timeRange, options);

  const foundPatterns: ExtractedPatternItem[] = [];

  for (const row of rows) {
    const extracted = extractPatternFromRow(row);
    if (extracted !== null) {
      foundPatterns.push(extracted);
    }
  }

  return {
    occurrence,
    patterns: foundPatterns,
  };
}

export interface PatternAggregationResult {
  readonly totalPatternsCount: number;
  readonly frequencies: ReadonlyArray<PatternFrequencyItem>;
}

/**
 * Aggregates frequency of patterns across all occurrences.
 * Calcola:
 * 6.1 Totale di pattern individuati (somma di tutti i pattern trovati in tutte le transizioni)
 * 6.2 Per ogni pattern, rapporto tra quante volte si è presentato e numero totale di pattern (percentuale)
 */
export function aggregatePatternFrequencies(
  results: ReadonlyArray<OccurrenceQueryResult>,
): PatternAggregationResult {
  const countMap = new Map<string, number>();
  let totalPatternsCount = 0;

  for (const res of results) {
    for (const p of res.patterns) {
      totalPatternsCount++;
      countMap.set(p.pattern, (countMap.get(p.pattern) ?? 0) + 1);
    }
  }

  const frequencies: PatternFrequencyItem[] = [];

  for (const [pattern, count] of countMap.entries()) {
    const percentage = totalPatternsCount > 0 ? (count / totalPatternsCount) * 100 : 0;
    frequencies.push({
      pattern,
      count,
      percentage,
    });
  }

  // Sort descending by occurrence count
  frequencies.sort((a, b) => b.count - a.count);

  return {
    totalPatternsCount,
    frequencies,
  };
}
