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

  it('keeps the statistics of the other queries when one has none, and reports nothing without any', () => {
    assert.equal(mergeCloudWatchLogsDiagnostics([]), undefined);
    assert.equal(mergeCloudWatchLogsDiagnostics([undefined]), undefined);
    const partial = mergeCloudWatchLogsDiagnostics([diagnostics(1, 1), undefined, diagnostics(2, 3)]);
    assert.equal(partial?.cloudWatchLogs?.statistics.recordsScanned, 4);
    assert.equal(partial?.cloudWatchLogs?.rowsReturned, 3);
  });
});
