import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Core } from '@go-automation/go-common';
import type { Dispatch } from '@go-automation/go-send';

import { exitCodeFor, formatDuration } from '../displaySummary.js';
import { TransitionLogger } from '../TransitionLogger.js';

/** Logger double that records info and warning lines. */
class FakeLogger {
  public readonly info: string[] = [];
  public readonly warnings: string[] = [];

  public readonly logger = {
    info: (message: string): void => {
      this.info.push(message);
    },
    warning: (message: string): void => {
      this.warnings.push(message);
    },
  } as unknown as Core.GOLogger;
}

describe('TransitionLogger', () => {
  it('logs errors always and the other transitions only with --verbose', () => {
    const quiet = new FakeLogger();
    const verbose = new FakeLogger();
    const failed = {
      ts: 't',
      event: 'SEND_FAILED' as const,
      rowKey: 'S-1',
      error: { code: 'PN_X', message: 'bad', details: '[{"code":"PN_X"}]' },
    };
    const sent = { ts: 't', event: 'SENT' as const, rowKey: 'S-2', iun: 'IUN', attempt: 1 };

    for (const target of [quiet, verbose]) {
      const logger = new TransitionLogger(target.logger, target === verbose);
      logger.handle(failed);
      logger.handle(sent);
      logger.handle({ ts: 't', event: 'DOCUMENT_UPLOADED' });
    }

    assert.deepEqual(quiet.warnings, ['[S-1] SEND_FAILED PN_X: bad [{"code":"PN_X"}]']);
    assert.deepEqual(quiet.info, []);
    assert.deepEqual(verbose.info, ['[S-2] SENT #1 iun=IUN'], 'run-level entries are not logged');
  });
});

describe('displaySummary helpers', () => {
  it('formats durations', () => {
    assert.equal(formatDuration(12_400), '12s');
    assert.equal(formatDuration(185_000), '3m 05s');
    assert.equal(formatDuration(3_720_000), '1h 02m');
  });

  it('returns 2 when some rows ended with a problem', () => {
    const progress = (status: Dispatch.RowStatus): Dispatch.DispatchProgress => ({
      byStatus: new Map<Dispatch.RowStatus, number>([[status, 1]]),
      ratePerSecond: 20,
      throttled: 0,
      verifyPending: 0,
      requestIdPending: 0,
      queuedCalls: 0,
    });
    assert.equal(exitCodeFor(progress('REQUEST_ID_FOUND')), 0);
    assert.equal(exitCodeFor(progress('ACCEPTED')), 0);
    assert.equal(exitCodeFor(progress('SEND_UNCERTAIN')), 2);
    assert.equal(exitCodeFor(progress('REQUEST_ID_NOT_FOUND')), 2);
  });
});
