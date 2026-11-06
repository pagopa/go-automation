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
  type OccurrenceQueryResult,
} from '../pattern-analyzer.js';

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
