import { AWSCloudWatchLogsService } from '@pagopa/go-aws/cloudwatch-logs';
import {
  readRowField,
  type GOLogsInsightsResultField,
  type AWSCloudWatchLogsQueryOptions,
} from '@pagopa/go-aws/cloudwatch-logs/insights';
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
export function extractPatternFromRow(row: ReadonlyArray<GOLogsInsightsResultField>): ExtractedPatternItem | null {
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
export function aggregateDominantPatterns(results: ReadonlyArray<OccurrenceQueryResult>): DominantPatternAggregation {
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
export function aggregatePatternCoverage(results: ReadonlyArray<OccurrenceQueryResult>): PatternCoverageAggregation {
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
export function aggregateTiedCombinations(results: ReadonlyArray<OccurrenceQueryResult>): TiedCombinationAggregation {
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

/**
 * Splits a CloudWatch Logs Insights query string into individual pipeline commands by `|`.
 * Correctly preserves pipes inside double quotes, single quotes, and regular expressions.
 */
export function splitCloudWatchCommands(query: string): string[] {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const commands: string[] = [];
  let current = '';
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let inRegex = false;
  let escapeCount = 0;

  const isRegexStart = (str: string, slashIndex: number): boolean => {
    let i = slashIndex - 1;
    while (i >= 0 && /\s/.test(str[i]!)) {
      i--;
    }
    if (i < 0) return true;
    const prevChar = str[i]!;
    if (['(', ',', '[', '=', '~', '!', '+', '-', '*', '%', ':'].includes(prevChar)) {
      return true;
    }
    const end = i + 1;
    while (i >= 0 && /[@\w.-]/.test(str[i]!)) {
      i--;
    }
    const word = str.slice(i + 1, end).toLowerCase();
    if (['like', 'match', 'return'].includes(word)) {
      return true;
    }
    while (i >= 0 && /\s/.test(str[i]!)) {
      i--;
    }
    const end2 = i + 1;
    while (i >= 0 && /\w/.test(str[i]!)) {
      i--;
    }
    const prevWord = str.slice(i + 1, end2).toLowerCase();
    if (prevWord === 'parse') {
      return true;
    }
    return false;
  };

  for (let i = 0; i < query.length; i++) {
    const char = query[i]!;

    if (char === '\\') {
      escapeCount++;
      current += char;
      continue;
    }

    const isEscaped = escapeCount % 2 === 1;
    escapeCount = 0;

    if (inDoubleQuote) {
      if (char === '"' && !isEscaped) {
        inDoubleQuote = false;
      }
      current += char;
    } else if (inSingleQuote) {
      if (char === '\'' && !isEscaped) {
        inSingleQuote = false;
      }
      current += char;
    } else if (inRegex) {
      if (char === '/' && !isEscaped) {
        inRegex = false;
      }
      current += char;
    } else {
      if (char === '"') {
        inDoubleQuote = true;
        current += char;
      } else if (char === '\'') {
        inSingleQuote = true;
        current += char;
      } else if (char === '/' && isRegexStart(query, i)) {
        inRegex = true;
        current += char;
      } else if (char === '|') {
        const trimmed = current.trim();
        if (trimmed.length > 0) {
          commands.push(trimmed);
        }
        current = '';
      } else {
        current += char;
      }
    }
  }

  const lastTrimmed = current.trim();
  if (lastTrimmed.length > 0) {
    commands.push(lastTrimmed);
  }

  return commands;
}

export interface PatternQueryInfo {
  readonly targetField: string;
  readonly baseQuery: string;
}

/**
 * Extracts the target field to parse and the sanitized upstream base query from a CloudWatch query.
 * Excludes display, sort, and limit commands that would conflict with stats aggregation.
 */
export function extractPatternQueryInfo(queryAwsCloudWatch?: string): PatternQueryInfo {
  if (!queryAwsCloudWatch || queryAwsCloudWatch.trim().length === 0) {
    return { targetField: '@message', baseQuery: '' };
  }

  const commands = splitCloudWatchCommands(queryAwsCloudWatch);
  let targetField = '@message';
  let patternCommandIndex = -1;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]!;
    const match = cmd.match(/^\s*pattern(?:\s+([@\w.-]+|`[^`]+`|"[^"]+"|'[^']+'))?\s*$/i);
    if (match) {
      patternCommandIndex = i;
      if (match[1]) {
        targetField = match[1].replace(/^[`"']|[`"']$/g, '');
      }
      break;
    }
  }

  const upstreamCommands = patternCommandIndex !== -1 ? commands.slice(0, patternCommandIndex) : commands;
  const filteredCommands = upstreamCommands.filter((cmd) => !/^\s*(display|sort|limit)\b/i.test(cmd));

  return {
    targetField,
    baseQuery: filteredCommands.join(' | '),
  };
}

/**
 * Builds a CloudWatch Logs Insights resolution query using parse, filter ispresent and stats.
 * Inherits upstream pipeline filters and target field from queryAwsCloudWatch if provided.
 * Returns null if the pattern does not contain any <*> tokens.
 */
export function buildPatternResolutionQuery(
  pattern: string,
  queryAwsCloudWatch?: string,
): { query: string; tokenCount: number } | null {
  const parts = pattern.split('<*>');
  const tokenCount = parts.length - 1;

  if (tokenCount <= 0) {
    return null;
  }

  const globPattern = pattern.replaceAll('<*>', '*');
  const quotedGlob = globPattern.includes('"') ? `'${globPattern}'` : `"${globPattern}"`;

  const varNames = Array.from({ length: tokenCount }, (_, i) => `t${i}`).join(', ');
  const statsClauses = Array.from(
    { length: tokenCount },
    (_, i) => `count_distinct(t${i}) as cd${i}, earliest(t${i}) as v${i}`,
  ).join(', ');

  const { targetField, baseQuery } = extractPatternQueryInfo(queryAwsCloudWatch);
  const resolutionTail = `parse ${targetField} ${quotedGlob} as ${varNames} | filter ispresent(t0) | stats ${statsClauses}`;
  const query = baseQuery.length > 0 ? `${baseQuery} | ${resolutionTail}` : resolutionTail;

  return {
    query,
    tokenCount,
  };
}

/**
 * Empirically resolves static <*> tokens in a pattern by running resolution queries across occurrence windows.
 * Replaces tokens that remain constant (count_distinct = 1 and same value in all windows) with their actual value.
 */
export async function resolvePatternTokens(
  logsService: AWSCloudWatchLogsService,
  logGroup: string,
  pattern: string,
  occurrenceWindows: ReadonlyArray<{ start: Date; end: Date }>,
  queryAwsCloudWatch?: string,
): Promise<string> {
  const resolutionQuery = buildPatternResolutionQuery(pattern, queryAwsCloudWatch);
  if (resolutionQuery === null || occurrenceWindows.length === 0) {
    return pattern;
  }

  const { query, tokenCount } = resolutionQuery;
  const tokenValues: Array<string | null> = Array.from({ length: tokenCount }, () => null);
  const tokenFailed: boolean[] = Array.from({ length: tokenCount }, () => false);

  for (const window of occurrenceWindows) {
    let rows: ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
    try {
      rows = await logsService.query([logGroup], query, window);
    } catch (err) {
      console.warn(
        `[WARN] Impossibile eseguire query di risoluzione per pattern su finestra ${window.start.toISOString()}:`,
        err,
      );
      // Transient error on this window: cannot confirm stability
      for (let i = 0; i < tokenCount; i++) {
        tokenFailed[i] = true;
      }
      break;
    }

    if (rows.length === 0) {
      // No rows returned: cannot confirm stability
      for (let i = 0; i < tokenCount; i++) {
        tokenFailed[i] = true;
      }
      break;
    }

    const firstRow = rows[0];
    if (!firstRow) {
      for (let i = 0; i < tokenCount; i++) {
        tokenFailed[i] = true;
      }
      break;
    }

    for (let i = 0; i < tokenCount; i++) {
      if (tokenFailed[i]) {
        continue;
      }

      const cdVal = readRowField(firstRow, `cd${i}`);
      const vVal = readRowField(firstRow, `v${i}`);

      if (cdVal === undefined || Number(cdVal) !== 1 || vVal === undefined) {
        tokenFailed[i] = true;
        continue;
      }

      if (tokenValues[i] === null) {
        tokenValues[i] = vVal;
      } else if (tokenValues[i] !== vVal) {
        tokenFailed[i] = true;
      }
    }
  }

  const resolvedTokens: string[] = [];
  for (let i = 0; i < tokenCount; i++) {
    if (!tokenFailed[i] && tokenValues[i] !== null) {
      resolvedTokens.push(tokenValues[i]!);
    } else {
      resolvedTokens.push('<*>');
    }
  }

  const parts = pattern.split('<*>');
  let resolved = parts[0] ?? '';
  for (let i = 0; i < tokenCount; i++) {
    const token = resolvedTokens[i] ?? '<*>';
    const part = parts[i + 1] ?? '';
    resolved += token + part;
  }

  return resolved;
}

/**
 * Applies resolved patterns to OccurrenceQueryResult array immutably.
 */
export function applyPatternResolutions(
  results: ReadonlyArray<OccurrenceQueryResult>,
  resolutionMap: ReadonlyMap<string, string>,
): OccurrenceQueryResult[] {
  return results.map((res) => ({
    occurrence: res.occurrence,
    patterns: res.patterns.map((p) => {
      const resolved = resolutionMap.get(p.pattern);
      if (resolved !== undefined && resolved !== p.pattern) {
        return {
          ...p,
          pattern: resolved,
        };
      }
      return { ...p };
    }),
  }));
}
