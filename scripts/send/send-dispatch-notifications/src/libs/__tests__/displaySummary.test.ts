import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Core } from '@go-automation/go-common';
import type { Dispatch } from '@go-automation/go-send';

import { displaySummary, exitCodeFor, formatDuration, unprocessedRows } from '../displaySummary.js';
import { countOutcomes } from '../outcomeCounts.js';
import { FakeLogger } from './helpers/testScript.js';

function progress(entries: ReadonlyArray<[Dispatch.RowStatus, number]>): Dispatch.DispatchProgress {
  return {
    byStatus: new Map<Dispatch.RowStatus, number>(entries),
    ratePerSecond: 20,
    throttled: 0,
    verifyPending: 0,
    requestIdPending: 0,
    queuedCalls: 0,
  };
}

describe('displaySummary helpers', () => {
  it('formats durations', () => {
    assert.equal(formatDuration(12_400), '12s');
    assert.equal(formatDuration(185_000), '3m 05s');
    assert.equal(formatDuration(3_720_000), '1h 02m');
  });

  it('returns 2 when some rows ended with a problem or were never processed', () => {
    assert.equal(exitCodeFor(progress([['REQUEST_ID_FOUND', 1]]), 1), 0);
    assert.equal(exitCodeFor(progress([['ACCEPTED', 1]]), 1), 0);
    assert.equal(exitCodeFor(progress([['SEND_UNCERTAIN', 1]]), 1), 2);
    assert.equal(exitCodeFor(progress([['REQUEST_ID_NOT_FOUND', 1]]), 1), 2);
    assert.equal(exitCodeFor(progress([['ACCEPTED', 1]]), 3), 2, 'two rows never journaled');
  });

  it('counts as not sent the rows without status and the PENDING ones', () => {
    assert.equal(
      unprocessedRows(
        progress([
          ['SENT', 2],
          ['PENDING', 1],
        ]),
        5,
      ),
      3,
    );
    assert.equal(unprocessedRows(progress([['SENT', 2]]), 2), 0);
  });

  it('derives sent, accepted and errors in one place', () => {
    const counts = countOutcomes(
      progress([
        ['SENT', 2],
        ['ACCEPTED', 3],
        ['REFUSED', 1],
        ['VERIFY_TIMEOUT', 1],
        ['REQUEST_ID_FOUND', 4],
        ['REQUEST_ID_NOT_FOUND', 1],
        ['SEND_FAILED', 1],
        ['SEND_UNCERTAIN', 2],
      ]).byStatus,
    );
    assert.deepEqual(counts, { accepted: 8, sent: 12, errors: 3 });
  });
});

describe('displaySummary', () => {
  it('separates the rows in flight at the interruption from the rows not sent', () => {
    const logger = new FakeLogger();
    displaySummary(logger as unknown as Core.GOLogger, {
      progress: progress([
        ['ACCEPTED', 2],
        ['SENDING', 1],
        ['RECONCILING', 1],
        ['PENDING', 1],
      ]),
      totalRows: 7,
      failures: [],
      statistics: { averageRate: undefined } as unknown as Dispatch.SendStatistics,
      validationMs: 1_000,
      executionMs: 2_000,
      output: { format: 'csv', outputPath: '/o.csv', reportPath: '/r.csv', includeStatus: false, onlySuccess: false },
      runDir: '/run',
    });
    const table = logger.of('kv');
    assert.ok(table.includes('Inviate=2'));
    assert.ok(table.includes('In corso all interruzione (da riconciliare)=2'));
    assert.ok(table.includes('Non inviate=3'), 'two rows never journaled plus one PENDING');
    assert.ok(logger.of('warning').some((line) => line.startsWith('Righe in corso all interruzione')));
  });
});
