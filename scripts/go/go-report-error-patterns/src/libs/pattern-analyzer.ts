import {
  AWSCloudWatchLogsService,
  readRowField,
  type ResultField,
  type AWSCloudWatchLogsQueryOptions,
} from '@go-automation/go-common/aws';
import type {
  AlarmOccurrence,
  ExtractedPatternItem,
  OccurrenceQueryResult,
  DominantPatternAggregation,
  PatternCoverageAggregation,
  TiedCombinationAggregation,
} from '../types/PatternTypes.js';

export type { OccurrenceQueryResult } from '../types/PatternTypes.js';

/**
 * Converts a raw ratio (which may be a number, numeric string, or undefined/invalid)
 * into a valid number, or null if it cannot be converted.
 */
export function toComparableRatio(ratio: number | string | undefined): number | null {
  if (ratio === undefined || ratio === null) {
    return null;
  }
  const n = typeof ratio === 'number' ? ratio : Number(ratio);
  return Number.isNaN(n) ? null : n;
}

/**
 * Rounds a number to a specified number of decimal places (default 4) for floating point safety.
 */
export function roundToDecimals(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
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
 * Extracts the dominant pattern for a single occurrence.
 * Priority:
 * 1. Pattern with highest numeric ratio.
 * 2. Fallback: Pattern with highest sampleCount (if no numeric ratio available).
 * 3. Ties: First pattern in array sharing the max value (ratios rounded to 4 decimals).
 * Returns null if no patterns are present.
 */
export function extractDominantPattern(result: OccurrenceQueryResult): ExtractedPatternItem | null {
  if (result.patterns.length === 0) {
    return null;
  }

  const validRatioPatterns = result.patterns.filter((p) => toComparableRatio(p.ratio) !== null);

  if (validRatioPatterns.length > 0) {
    const maxRatio = Math.max(...validRatioPatterns.map((p) => toComparableRatio(p.ratio)!));
    const roundedMaxRatio = roundToDecimals(maxRatio, 4);

    const dominant = result.patterns.find((p) => {
      const r = toComparableRatio(p.ratio);
      return r !== null && roundToDecimals(r, 4) === roundedMaxRatio;
    });

    return dominant ?? null;
  }

  // Fallback to sampleCount
  const validSampleCountPatterns = result.patterns.filter(
    (p) => p.sampleCount !== undefined && !Number.isNaN(p.sampleCount),
  );

  if (validSampleCountPatterns.length > 0) {
    const maxSample = Math.max(...validSampleCountPatterns.map((p) => p.sampleCount!));
    const dominant = result.patterns.find((p) => p.sampleCount === maxSample);
    return dominant ?? null;
  }

  return result.patterns[0] ?? null;
}

/**
 * Checks whether an occurrence has a tie (2 or more patterns sharing the maximum ratio or sampleCount).
 */
export function isTiedOccurrence(result: OccurrenceQueryResult): boolean {
  if (result.patterns.length < 2) {
    return false;
  }

  const validRatioPatterns = result.patterns.filter((p) => toComparableRatio(p.ratio) !== null);

  if (validRatioPatterns.length > 0) {
    if (validRatioPatterns.length < 2) {
      return false;
    }
    const maxRatio = Math.max(...validRatioPatterns.map((p) => toComparableRatio(p.ratio)!));
    const roundedMaxRatio = roundToDecimals(maxRatio, 4);
    const tiedCount = validRatioPatterns.filter(
      (p) => roundToDecimals(toComparableRatio(p.ratio)!, 4) === roundedMaxRatio,
    ).length;
    return tiedCount >= 2;
  }

  // Fallback to sampleCount
  const validSampleCountPatterns = result.patterns.filter(
    (p) => p.sampleCount !== undefined && !Number.isNaN(p.sampleCount),
  );

  if (validSampleCountPatterns.length >= 2) {
    const maxSample = Math.max(...validSampleCountPatterns.map((p) => p.sampleCount!));
    const tiedCount = validSampleCountPatterns.filter((p) => p.sampleCount === maxSample).length;
    return tiedCount >= 2;
  }

  return false;
}

/**
 * Returns the patterns involved in a tie for an occurrence.
 * If there is no tie, returns an empty array.
 */
export function extractTiedPatterns(result: OccurrenceQueryResult): ExtractedPatternItem[] {
  if (!isTiedOccurrence(result)) {
    return [];
  }

  const validRatioPatterns = result.patterns.filter((p) => toComparableRatio(p.ratio) !== null);

  if (validRatioPatterns.length > 0) {
    const maxRatio = Math.max(...validRatioPatterns.map((p) => toComparableRatio(p.ratio)!));
    const roundedMaxRatio = roundToDecimals(maxRatio, 4);
    return result.patterns.filter((p) => {
      const r = toComparableRatio(p.ratio);
      return r !== null && roundToDecimals(r, 4) === roundedMaxRatio;
    });
  }

  // Fallback to sampleCount
  const validSampleCountPatterns = result.patterns.filter(
    (p) => p.sampleCount !== undefined && !Number.isNaN(p.sampleCount),
  );

  if (validSampleCountPatterns.length > 0) {
    const maxSample = Math.max(...validSampleCountPatterns.map((p) => p.sampleCount!));
    return result.patterns.filter((p) => p.sampleCount === maxSample);
  }

  return [];
}

/**
 * Aggregates dominant patterns across occurrences.
 * Total percentage is calculated over totalOccurrences.
 */
export function aggregateDominantPatterns(
  results: ReadonlyArray<OccurrenceQueryResult>,
): DominantPatternAggregation {
  const totalOccurrences = results.length;
  const occurrencesWithPatterns = results.filter((r) => r.patterns.length > 0).length;
  const occurrencesWithoutPatterns = totalOccurrences - occurrencesWithPatterns;

  const countMap = new Map<string, { count: number; hasTies: boolean }>();

  for (const res of results) {
    const dominant = extractDominantPattern(res);
    if (dominant !== null) {
      const tied = isTiedOccurrence(res);
      const existing = countMap.get(dominant.pattern);
      if (existing) {
        existing.count += 1;
        if (tied) {
          existing.hasTies = true;
        }
      } else {
        countMap.set(dominant.pattern, { count: 1, hasTies: tied });
      }
    }
  }

  const dominantPatterns = Array.from(countMap.entries()).map(([pattern, data]) => ({
    pattern,
    count: data.count,
    percentage: totalOccurrences > 0 ? (data.count / totalOccurrences) * 100 : 0,
    hasTies: data.hasTies,
  }));

  dominantPatterns.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.pattern.localeCompare(b.pattern);
  });

  return {
    totalOccurrences,
    occurrencesWithPatterns,
    occurrencesWithoutPatterns,
    dominantPatterns,
  };
}

/**
 * Aggregates pattern coverage across occurrences (in how many distinct occurrences each pattern appeared).
 * Total percentage is calculated over totalOccurrences.
 */
export function aggregatePatternCoverage(
  results: ReadonlyArray<OccurrenceQueryResult>,
): PatternCoverageAggregation {
  const totalOccurrences = results.length;
  const occurrencesWithPatterns = results.filter((r) => r.patterns.length > 0).length;
  const occurrencesWithoutPatterns = totalOccurrences - occurrencesWithPatterns;

  const countMap = new Map<string, number>();

  for (const res of results) {
    const uniquePatterns = new Set(res.patterns.map((p) => p.pattern));
    for (const pattern of uniquePatterns) {
      countMap.set(pattern, (countMap.get(pattern) ?? 0) + 1);
    }
  }

  const patternCoverage = Array.from(countMap.entries()).map(([pattern, count]) => ({
    pattern,
    count,
    percentage: totalOccurrences > 0 ? (count / totalOccurrences) * 100 : 0,
  }));

  patternCoverage.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.pattern.localeCompare(b.pattern);
  });

  return {
    totalOccurrences,
    occurrencesWithPatterns,
    occurrencesWithoutPatterns,
    patternCoverage,
  };
}

/**
 * Aggregates combinations of tied patterns across occurrences.
 * Total percentage is calculated over totalOccurrences.
 */
export function aggregateTiedCombinations(
  results: ReadonlyArray<OccurrenceQueryResult>,
): TiedCombinationAggregation {
  const totalOccurrences = results.length;
  const combinationMap = new Map<string, { patterns: string[]; count: number }>();

  for (const res of results) {
    if (isTiedOccurrence(res)) {
      const tied = extractTiedPatterns(res);
      const sortedPatterns = tied.map((p) => p.pattern).sort();
      const key = JSON.stringify(sortedPatterns);
      const existing = combinationMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        combinationMap.set(key, { patterns: sortedPatterns, count: 1 });
      }
    }
  }

  if (combinationMap.size === 0) {
    return {
      totalOccurrences,
      message: 'Nessuna occorrenza con pattern in pareggio rilevata.',
      tiedCombinations: [],
    };
  }

  const tiedCombinations = Array.from(combinationMap.values()).map((item) => ({
    patterns: item.patterns,
    count: item.count,
    percentage: totalOccurrences > 0 ? (item.count / totalOccurrences) * 100 : 0,
  }));

  tiedCombinations.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.patterns.join(' + ').localeCompare(b.patterns.join(' + '));
  });

  return {
    totalOccurrences,
    message: null,
    tiedCombinations,
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
