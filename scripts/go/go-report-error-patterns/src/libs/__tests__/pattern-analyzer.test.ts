import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractPatternFromRow,
  toComparableRatio,
  roundToDecimals,
  extractDominantPattern,
  isTiedOccurrence,
  extractTiedPatterns,
  aggregateDominantPatterns,
  aggregatePatternCoverage,
  aggregateTiedCombinations,
  buildPatternResolutionQuery,
  resolvePatternTokens,
  applyPatternResolutions,
  type OccurrenceQueryResult,
} from '../pattern-analyzer.js';
import type { AWSCloudWatchLogsService } from '@go-automation/go-common/aws';

const mockOccurrence = {
  timestamp: new Date('2026-11-01T12:00:00Z'),
  queryStartTime: new Date('2026-11-01T11:58:00Z'),
  queryEndTime: new Date('2026-11-01T12:01:00Z'),
  evaluatingDatapointTimestamps: [],
};

test('extractPatternFromRow extracts ratio, sampleCount and pattern correctly by name and index', () => {
  const rowNamed = [
    { field: '@ratio', value: '0.25' },
    { field: 'other', value: 'xxx' },
    { field: '@sampleCount', value: '10' },
    { field: '@pattern', value: 'Error: Connection reset by peer' },
  ];
  const resultNamed = extractPatternFromRow(rowNamed);
  assert.ok(resultNamed);
  assert.strictEqual(resultNamed.pattern, 'Error: Connection reset by peer');
  assert.strictEqual(resultNamed.ratio, 0.25);
  assert.strictEqual(resultNamed.sampleCount, 10);

  // By column position (1: ratio, 5: sampleCount, 8: pattern in 1-based indexing)
  const rowPositional = [
    { field: 'col1', value: '0.75' },
    { field: 'col2', value: 'foo' },
    { field: 'col3', value: 'bar' },
    { field: 'col4', value: 'baz' },
    { field: 'col5', value: '30' },
    { field: 'col6', value: 'qux' },
    { field: 'col7', value: 'quux' },
    { field: 'col8', value: 'Exception occurred in cluster' },
  ];
  const resultPositional = extractPatternFromRow(rowPositional);
  assert.ok(resultPositional);
  assert.strictEqual(resultPositional.pattern, 'Exception occurred in cluster');
  assert.strictEqual(resultPositional.ratio, 0.75);
  assert.strictEqual(resultPositional.sampleCount, 30);

  // Row with missing pattern
  const rowEmpty = [{ field: 'other', value: 'abc' }];
  assert.strictEqual(extractPatternFromRow(rowEmpty), null);
});

test('toComparableRatio and roundToDecimals handle numbers, strings and edge cases', () => {
  assert.strictEqual(toComparableRatio(0.45), 0.45);
  assert.strictEqual(toComparableRatio('0.45'), 0.45);
  assert.strictEqual(toComparableRatio(undefined), null);
  assert.strictEqual(toComparableRatio('n/a'), null);

  assert.strictEqual(roundToDecimals(0.123456, 4), 0.1235);
  assert.strictEqual(roundToDecimals(0.12344, 4), 0.1234);
});

test('extractDominantPattern selects pattern with highest ratio or fallback to sampleCount', () => {
  const resultRatio: OccurrenceQueryResult = {
    occurrence: mockOccurrence,
    patterns: [
      { pattern: 'Pattern A', ratio: 0.2, sampleCount: 20 },
      { pattern: 'Pattern B', ratio: 0.8, sampleCount: 10 },
    ],
  };
  const dominantRatio = extractDominantPattern(resultRatio);
  assert.ok(dominantRatio);
  assert.strictEqual(dominantRatio.pattern, 'Pattern B');

  // Fallback to sampleCount when ratio is missing / not numeric
  const resultFallback: OccurrenceQueryResult = {
    occurrence: mockOccurrence,
    patterns: [
      { pattern: 'Pattern A', ratio: 'n/a', sampleCount: 15 },
      { pattern: 'Pattern B', ratio: undefined, sampleCount: 50 },
    ],
  };
  const dominantFallback = extractDominantPattern(resultFallback);
  assert.ok(dominantFallback);
  assert.strictEqual(dominantFallback.pattern, 'Pattern B');

  // Empty patterns
  const resultEmpty: OccurrenceQueryResult = {
    occurrence: mockOccurrence,
    patterns: [],
  };
  assert.strictEqual(extractDominantPattern(resultEmpty), null);

  // Tie selects first in array
  const resultTie: OccurrenceQueryResult = {
    occurrence: mockOccurrence,
    patterns: [
      { pattern: 'Pattern First', ratio: 0.5 },
      { pattern: 'Pattern Second', ratio: 0.5 },
    ],
  };
  const dominantTie = extractDominantPattern(resultTie);
  assert.ok(dominantTie);
  assert.strictEqual(dominantTie.pattern, 'Pattern First');
});

test('isTiedOccurrence and extractTiedPatterns detect ties accurately', () => {
  const occurrenceNoTie: OccurrenceQueryResult = {
    occurrence: mockOccurrence,
    patterns: [
      { pattern: 'Pattern A', ratio: 0.6 },
      { pattern: 'Pattern B', ratio: 0.4 },
    ],
  };
  assert.strictEqual(isTiedOccurrence(occurrenceNoTie), false);
  assert.deepStrictEqual(extractTiedPatterns(occurrenceNoTie), []);

  const occurrenceTie: OccurrenceQueryResult = {
    occurrence: mockOccurrence,
    patterns: [
      { pattern: 'Pattern A', ratio: 0.5 },
      { pattern: 'Pattern B', ratio: 0.5 },
      { pattern: 'Pattern C', ratio: 0.1 },
    ],
  };
  assert.strictEqual(isTiedOccurrence(occurrenceTie), true);
  const tied = extractTiedPatterns(occurrenceTie);
  assert.strictEqual(tied.length, 2);
  assert.strictEqual(tied[0]?.pattern, 'Pattern A');
  assert.strictEqual(tied[1]?.pattern, 'Pattern B');

  // Single pattern cannot be tied
  const occurrenceSingle: OccurrenceQueryResult = {
    occurrence: mockOccurrence,
    patterns: [{ pattern: 'Pattern A', ratio: 1.0 }],
  };
  assert.strictEqual(isTiedOccurrence(occurrenceSingle), false);
  assert.deepStrictEqual(extractTiedPatterns(occurrenceSingle), []);
});

test('aggregateDominantPatterns aggregates dominant pattern counts and ties across occurrences', () => {
  const results: OccurrenceQueryResult[] = [
    // Occurrence 1: timeout dominant (70%)
    {
      occurrence: mockOccurrence,
      patterns: [
        { pattern: 'timeout', ratio: 0.7 },
        { pattern: 'connection_reset', ratio: 0.3 },
      ],
    },
    // Occurrence 2: timeout dominant (100%)
    {
      occurrence: mockOccurrence,
      patterns: [{ pattern: 'timeout', ratio: 1.0 }],
    },
    // Occurrence 3: tie between timeout and connection_reset (50% each) -> timeout selected (first), hasTies = true
    {
      occurrence: mockOccurrence,
      patterns: [
        { pattern: 'timeout', ratio: 0.5 },
        { pattern: 'connection_reset', ratio: 0.5 },
      ],
    },
    // Occurrence 4: no patterns
    {
      occurrence: mockOccurrence,
      patterns: [],
    },
  ];

  const agg = aggregateDominantPatterns(results);
  assert.strictEqual(agg.totalOccurrences, 4);
  assert.strictEqual(agg.occurrencesWithPatterns, 3);
  assert.strictEqual(agg.occurrencesWithoutPatterns, 1);
  assert.strictEqual(agg.dominantPatterns.length, 1);

  // timeout was dominant in 3 occurrences out of 4 total occurrences = 75.0%
  assert.strictEqual(agg.dominantPatterns[0]?.pattern, 'timeout');
  assert.strictEqual(agg.dominantPatterns[0]?.count, 3);
  assert.strictEqual(agg.dominantPatterns[0]?.percentage, 75);
  assert.strictEqual(agg.dominantPatterns[0]?.hasTies, true);
});

test('aggregatePatternCoverage counts distinct occurrences per pattern', () => {
  const results: OccurrenceQueryResult[] = [
    {
      occurrence: mockOccurrence,
      patterns: [
        { pattern: 'timeout', ratio: 0.8 },
        { pattern: 'timeout', ratio: 0.1 }, // duplicate in same occurrence counts as 1
        { pattern: 'connection_reset', ratio: 0.1 },
      ],
    },
    {
      occurrence: mockOccurrence,
      patterns: [{ pattern: 'timeout', ratio: 1.0 }],
    },
    {
      occurrence: mockOccurrence,
      patterns: [],
    },
  ];

  const agg = aggregatePatternCoverage(results);
  assert.strictEqual(agg.totalOccurrences, 3);
  assert.strictEqual(agg.occurrencesWithPatterns, 2);
  assert.strictEqual(agg.occurrencesWithoutPatterns, 1);

  // timeout in 2 occurrences out of 3 = 66.666...%
  const timeoutItem = agg.patternCoverage.find((p) => p.pattern === 'timeout');
  assert.ok(timeoutItem);
  assert.strictEqual(timeoutItem.count, 2);
  assert.strictEqual(roundToDecimals(timeoutItem.percentage, 2), 66.67);

  // connection_reset in 1 occurrence out of 3 = 33.333...%
  const connItem = agg.patternCoverage.find((p) => p.pattern === 'connection_reset');
  assert.ok(connItem);
  assert.strictEqual(connItem.count, 1);
  assert.strictEqual(roundToDecimals(connItem.percentage, 2), 33.33);
});

test('aggregateTiedCombinations groups tied combinations and handles no-ties case', () => {
  // Case with ties
  const resultsWithTies: OccurrenceQueryResult[] = [
    {
      occurrence: mockOccurrence,
      patterns: [
        { pattern: 'error_b', ratio: 0.5 },
        { pattern: 'error_a', ratio: 0.5 },
      ],
    },
    {
      occurrence: mockOccurrence,
      patterns: [
        { pattern: 'error_a', ratio: 0.5 },
        { pattern: 'error_b', ratio: 0.5 },
      ],
    },
    {
      occurrence: mockOccurrence,
      patterns: [{ pattern: 'error_c', ratio: 1.0 }],
    },
  ];

  const aggWithTies = aggregateTiedCombinations(resultsWithTies);
  assert.strictEqual(aggWithTies.totalOccurrences, 3);
  assert.strictEqual(aggWithTies.message, null);
  assert.strictEqual(aggWithTies.tiedCombinations.length, 1);
  // Canonical combination sorted alphabetically: ['error_a', 'error_b']
  assert.deepStrictEqual(aggWithTies.tiedCombinations[0]?.patterns, ['error_a', 'error_b']);
  assert.strictEqual(aggWithTies.tiedCombinations[0]?.count, 2);
  assert.strictEqual(roundToDecimals(aggWithTies.tiedCombinations[0]?.percentage ?? 0, 2), 66.67);

  // Case with no ties
  const resultsNoTies: OccurrenceQueryResult[] = [
    {
      occurrence: mockOccurrence,
      patterns: [{ pattern: 'error_a', ratio: 1.0 }],
    },
  ];

  const aggNoTies = aggregateTiedCombinations(resultsNoTies);
  assert.strictEqual(aggNoTies.totalOccurrences, 1);
  assert.strictEqual(aggNoTies.message, 'Nessuna occorrenza con pattern in pareggio rilevata.');
  assert.deepStrictEqual(aggNoTies.tiedCombinations, []);
});

test('buildPatternResolutionQuery generates correct query or returns null', () => {
  // Pattern with 0 <*> -> null
  assert.strictEqual(buildPatternResolutionQuery('Static error message without tokens'), null);

  // Pattern with 1 <*>
  const resSingle = buildPatternResolutionQuery('ERROR: code <*>');
  assert.ok(resSingle);
  assert.strictEqual(resSingle.tokenCount, 1);
  assert.strictEqual(
    resSingle.query,
    'parse @message "ERROR: code *" as t0 | filter ispresent(t0) | stats count_distinct(t0) as cd0, earliest(t0) as v0',
  );

  // Pattern with N <*>
  const resMultiple = buildPatternResolutionQuery('<*> ERROR - status <*> in <*>');
  assert.ok(resMultiple);
  assert.strictEqual(resMultiple.tokenCount, 3);
  assert.strictEqual(
    resMultiple.query,
    'parse @message "* ERROR - status * in *" as t0, t1, t2 | filter ispresent(t0) | stats count_distinct(t0) as cd0, earliest(t0) as v0, count_distinct(t1) as cd1, earliest(t1) as v1, count_distinct(t2) as cd2, earliest(t2) as v2',
  );

  // Pattern with special characters in static parts (parentheses, slashes, dashes)
  const resSpecial = buildPatternResolutionQuery('<*> Heartbeat(key: <*>, version: <*>) - coordinator/node');
  assert.ok(resSpecial);
  assert.strictEqual(resSpecial.tokenCount, 3);
  assert.strictEqual(
    resSpecial.query,
    'parse @message "* Heartbeat(key: *, version: *) - coordinator/node" as t0, t1, t2 | filter ispresent(t0) | stats count_distinct(t0) as cd0, earliest(t0) as v0, count_distinct(t1) as cd1, earliest(t1) as v1, count_distinct(t2) as cd2, earliest(t2) as v2',
  );

  // Pattern containing double quotes in static parts -> wrapped in single quotes
  const resQuotes = buildPatternResolutionQuery('<*> ERROR - "Failed to connect" code <*>');
  assert.ok(resQuotes);
  assert.strictEqual(resQuotes.tokenCount, 2);
  assert.strictEqual(
    resQuotes.query,
    "parse @message '* ERROR - \"Failed to connect\" code *' as t0, t1 | filter ispresent(t0) | stats count_distinct(t0) as cd0, earliest(t0) as v0, count_distinct(t1) as cd1, earliest(t1) as v1",
  );
});

test('resolvePatternTokens resolves stable tokens across windows and handles variations and errors', async () => {
  const windows = [
    { start: new Date('2026-11-01T10:00:00Z'), end: new Date('2026-11-01T10:05:00Z') },
    { start: new Date('2026-11-01T11:00:00Z'), end: new Date('2026-11-01T11:05:00Z') },
  ];

  // Pattern without <*> returns pattern unchanged without queries
  let queryCount = 0;
  const mockServiceNoTokens = {
    query: async () => {
      queryCount++;
      return [];
    },
  } as unknown as AWSCloudWatchLogsService;
  const noTokensResult = await resolvePatternTokens(mockServiceNoTokens, 'grp', 'Plain error', windows);
  assert.strictEqual(noTokensResult, 'Plain error');
  assert.strictEqual(queryCount, 0);

  // Case 1: All tokens stable across all windows
  const mockServiceAllStable = {
    query: async () => [
      [
        { field: 'cd0', value: '1' },
        { field: 'v0', value: '12' },
        { field: 'cd1', value: '1' },
        { field: 'v1', value: '3' },
      ],
    ],
  } as unknown as AWSCloudWatchLogsService;
  const patternAllStable = 'Heartbeat(key: <*>, version: <*>)';
  const resolvedAllStable = await resolvePatternTokens(
    mockServiceAllStable,
    'grp',
    patternAllStable,
    windows,
  );
  assert.strictEqual(resolvedAllStable, 'Heartbeat(key: 12, version: 3)');

  // Case 2: No stable tokens (count_distinct > 1 in both windows)
  const mockServiceNoneStable = {
    query: async () => [
      [
        { field: 'cd0', value: '3' },
        { field: 'v0', value: 'foo' },
      ],
    ],
  } as unknown as AWSCloudWatchLogsService;
  const patternNoneStable = 'ERROR <*>';
  const resolvedNoneStable = await resolvePatternTokens(
    mockServiceNoneStable,
    'grp',
    patternNoneStable,
    windows,
  );
  assert.strictEqual(resolvedNoneStable, 'ERROR <*>');

  // Case 3: Mix - first token variable (cd0 > 1), second token stable (cd1 = 1, v1 = 'auth')
  // Verifies positional substitution without misplaced replacements
  const mockServiceMix = {
    query: async () => [
      [
        { field: 'cd0', value: '5' },
        { field: 'v0', value: 'rand1' },
        { field: 'cd1', value: '1' },
        { field: 'v1', value: 'auth' },
      ],
    ],
  } as unknown as AWSCloudWatchLogsService;
  const patternMix = 'Request <*> failed at module <*>';
  const resolvedMix = await resolvePatternTokens(mockServiceMix, 'grp', patternMix, windows);
  assert.strictEqual(resolvedMix, 'Request <*> failed at module auth');

  // Case 4: Token stable in each individual window, but value varies across windows (12 in win 0, 99 in win 1)
  let callIndex = 0;
  const mockServiceVaryingWindows = {
    query: async () => {
      const val = callIndex === 0 ? '12' : '99';
      callIndex++;
      return [
        [
          { field: 'cd0', value: '1' },
          { field: 'v0', value: val },
        ],
      ];
    },
  } as unknown as AWSCloudWatchLogsService;
  const patternVarying = 'Code <*>';
  const resolvedVarying = await resolvePatternTokens(
    mockServiceVaryingWindows,
    'grp',
    patternVarying,
    windows,
  );
  assert.strictEqual(resolvedVarying, 'Code <*>');

  // Case 5: Query returns empty rows (zero matches) -> remains <*>
  const mockServiceEmpty = {
    query: async () => [],
  } as unknown as AWSCloudWatchLogsService;
  const resolvedEmpty = await resolvePatternTokens(mockServiceEmpty, 'grp', 'Code <*>', windows);
  assert.strictEqual(resolvedEmpty, 'Code <*>');

  // Case 6: Transient query error (rejection) -> safely caught, remains <*>
  const mockServiceError = {
    query: async () => {
      throw new Error('AWS ThrottlingException');
    },
  } as unknown as AWSCloudWatchLogsService;
  const resolvedError = await resolvePatternTokens(mockServiceError, 'grp', 'Code <*>', windows);
  assert.strictEqual(resolvedError, 'Code <*>');
});

test('applyPatternResolutions maps patterns immutably', () => {
  const originalResults: OccurrenceQueryResult[] = [
    {
      occurrence: mockOccurrence,
      patterns: [
        { pattern: 'ERROR status <*> for endpoint <*>', ratio: 0.8, sampleCount: 80 },
        { pattern: 'Unchanged pattern', ratio: 0.2, sampleCount: 20 },
      ],
    },
  ];

  // Empty resolution map returns identical patterns without mutations
  const resEmptyMap = applyPatternResolutions(originalResults, new Map());
  assert.strictEqual(resEmptyMap.length, 1);
  assert.notStrictEqual(resEmptyMap, originalResults);
  assert.strictEqual(resEmptyMap[0]?.patterns[0]?.pattern, 'ERROR status <*> for endpoint <*>');

  // Map with replacement
  const map = new Map<string, string>([
    ['ERROR status <*> for endpoint <*>', 'ERROR status 500 for endpoint <*>'],
  ]);
  const resApplied = applyPatternResolutions(originalResults, map);

  assert.strictEqual(resApplied.length, 1);
  assert.notStrictEqual(resApplied[0], originalResults[0]);
  assert.strictEqual(
    resApplied[0]?.patterns[0]?.pattern,
    'ERROR status 500 for endpoint <*>',
  );
  assert.strictEqual(resApplied[0]?.patterns[0]?.ratio, 0.8);
  assert.strictEqual(resApplied[0]?.patterns[0]?.sampleCount, 80);
  assert.strictEqual(resApplied[0]?.patterns[1]?.pattern, 'Unchanged pattern');

  // Ensure original array and objects are untouched
  assert.strictEqual(
    originalResults[0]?.patterns[0]?.pattern,
    'ERROR status <*> for endpoint <*>',
  );
});

