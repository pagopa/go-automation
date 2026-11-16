import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { StepDiagnostics } from '../../../../../../engine/tracing/StepDiagnostics.js';
import { mergeCloudWatchLogsDiagnostics } from '../mergeCloudWatchLogsDiagnostics.js';

function diagnostics(rows: number, scanned: number): StepDiagnostics {
  return {
    cloudWatchLogs: {
      rowsReturned: rows,
      statistics: { bytesScanned: scanned * 10, recordsScanned: scanned, recordsMatched: rows },
      queryExecutions: [],
    },
  };
}

describe('mergeCloudWatchLogsDiagnostics', () => {
  it('sums rows and statistics of every query', () => {
    const merged = mergeCloudWatchLogsDiagnostics([diagnostics(2, 5), diagnostics(3, 7)]);
    assert.equal(merged?.cloudWatchLogs?.rowsReturned, 5);
    assert.equal(merged?.cloudWatchLogs?.statistics.recordsScanned, 12);
    assert.equal(merged?.cloudWatchLogs?.statistics.recordsMatched, 5);
  });

  it('reports nothing without queries or when one query has no statistics', () => {
    assert.equal(mergeCloudWatchLogsDiagnostics([]), undefined);
    assert.equal(mergeCloudWatchLogsDiagnostics([diagnostics(1, 1), undefined]), undefined);
  });
});
