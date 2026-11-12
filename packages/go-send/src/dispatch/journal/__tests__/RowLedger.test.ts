import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import type { RowState } from '../../model/RowState.js';
import { decideRowAction } from '../../run/decideRowAction.js';
import type { RowActionPolicy } from '../../run/RowActionPolicy.js';
import { MemorySink } from '../../__tests__/helpers/MemorySink.js';
import { collect } from '../../__tests__/helpers/collect.js';
import { readFixture, tempDir, writeFixture } from '../../__tests__/helpers/testFiles.js';
import { applyJournalEntry } from '../applyJournalEntry.js';
import type { JournalEntry } from '../JournalEntry.js';
import { Journal } from '../Journal.js';
import { RowLedger } from '../RowLedger.js';

const ROW = { rowIndex: 3, rowKey: 'S-03' } as const;

describe('applyJournalEntry', () => {
  it('folds the transitions of a row', () => {
    let state = applyJournalEntry(undefined, {
      ts: 't1',
      event: 'SENDING',
      ...ROW,
      paProtocolNumber: 'P',
      idempotenceToken: 'T',
      attempt: 1,
    });
    state = applyJournalEntry(state, { ts: 't2', event: 'SENT', ...ROW, notificationRequestId: 'N', iun: 'I' });
    state = applyJournalEntry(state, { ts: 't3', event: 'WARNING', ...ROW, warning: 'W' });
    state = applyJournalEntry(state, { ts: 't4', event: 'ACCEPTED', ...ROW, iun: 'I2', attempt: 2 });
    assert.equal(state?.status, 'ACCEPTED');
    assert.equal(state?.paProtocolNumber, 'P');
    assert.equal(state?.iun, 'I2');
    assert.equal(state?.sentAt, 't2');
    assert.equal(state?.acceptedAt, 't4');
    assert.equal(state?.sendAttempts, 1);
    assert.equal(state?.verifyChecks, 2);
    assert.deepEqual(state?.warnings, ['W']);
  });

  it('keeps the error of failures and clears it on success', () => {
    let state = applyJournalEntry(undefined, {
      ts: 't',
      event: 'SEND_FAILED',
      ...ROW,
      error: { code: 'X', message: 'm' },
    });
    assert.equal(state?.error?.code, 'X');
    state = applyJournalEntry(state, { ts: 't', event: 'SENDING', ...ROW });
    assert.equal(state?.error, undefined);
  });

  it('brings a revalidated row back to PENDING without its old error', () => {
    const invalid = applyJournalEntry(undefined, {
      ts: 't1',
      event: 'ROW_INVALID',
      ...ROW,
      error: { code: 'MISSING_FIELD', message: 'm' },
    });
    const revalidated = applyJournalEntry(invalid, { ts: 't2', event: 'ROW_REVALIDATED', ...ROW });
    assert.equal(revalidated?.status, 'PENDING');
    assert.equal(revalidated?.error, undefined);
  });

  it('takes the requestId of REQUEST_ID_FOUND', () => {
    const state = applyJournalEntry(undefined, { ts: 't', event: 'REQUEST_ID_FOUND', ...ROW, requestId: 'R' });
    assert.equal(state?.requestId, 'R');
    assert.equal(state?.requestIdReason, 'FOUND');
  });

  it('keeps the acceptance read from the timeline across later requestId entries', () => {
    const found = applyJournalEntry(undefined, {
      ts: 't1',
      event: 'REQUEST_ID_FOUND',
      ...ROW,
      requestId: 'R',
      timelineAcceptance: 'REFUSED',
    });
    assert.equal(found?.timelineAcceptance, 'REFUSED');
    const later = applyJournalEntry(found, {
      ts: 't2',
      event: 'REQUEST_ID_NOT_FOUND',
      ...ROW,
      requestIdReason: 'TIMEOUT',
    });
    assert.equal(later?.timelineAcceptance, 'REFUSED', 'an entry without evidence does not erase it');
  });

  it('takes the direct requestId from SENT, never from a SENDING attempt', () => {
    let state = applyJournalEntry(undefined, { ts: 't1', event: 'SENDING', ...ROW, requestId: 'R', attempt: 1 });
    assert.equal(state?.requestId, undefined);
    const failed = applyJournalEntry(state, {
      ts: 't2',
      event: 'SEND_FAILED',
      ...ROW,
      error: { code: 'HTTP_400', message: 'm' },
    });
    assert.equal(failed?.requestId, undefined, 'a rejected row has no requestId in the output');
    state = applyJournalEntry(state, { ts: 't2', event: 'SENT', ...ROW, requestId: 'R', attempt: 1 });
    assert.equal(state?.requestId, 'R');
  });
});

describe('RowLedger', () => {
  it('records to the sink and replays to the same state', async () => {
    const sink = new MemorySink();
    const ledger = new RowLedger(sink);
    await ledger.record({ event: 'SENDING', ...ROW, attempt: 1 });
    await ledger.record({ event: 'SENT', ...ROW, notificationRequestId: 'N' });
    await ledger.record({
      event: 'DOCUMENT_UPLOADED',
      upload: { sha256: 's', key: 'k', versionToken: 'v', contentType: 'application/pdf' },
    });
    assert.equal(sink.entries.length, 3);

    const replayed = await RowLedger.replay(sink.entries, undefined);
    assert.deepEqual(replayed.get(3), ledger.get(3));
    assert.equal(replayed.recordedUploads()[0]?.key, 'k');
    assert.equal(replayed.countByStatus().get('SENT'), 1);
  });
});

describe('RowLedger.countByStatus', () => {
  it('follows every transition without rescanning, and returns snapshots', async () => {
    const ledger = new RowLedger(undefined);
    await ledger.record({ event: 'SENDING', rowIndex: 0, rowKey: 'A' });
    await ledger.record({ event: 'SENDING', rowIndex: 1, rowKey: 'B' });
    const before = ledger.countByStatus();
    await ledger.record({ event: 'SENT', rowIndex: 0, rowKey: 'A' });
    await ledger.record({ event: 'WARNING', rowIndex: 0, rowKey: 'A', warning: 'W' });
    await ledger.record({ event: 'SEND_FAILED', rowIndex: 1, rowKey: 'B', error: { code: 'X', message: 'm' } });
    const after = ledger.countByStatus();
    assert.deepEqual([...before], [['SENDING', 2]], 'an earlier snapshot is not changed');
    assert.deepEqual(
      [...after].sort(),
      [
        ['SEND_FAILED', 1],
        ['SENT', 1],
      ],
      'statuses left by every row are removed',
    );
    const replayed = await RowLedger.replay(
      (async function* entries(): AsyncGenerator<JournalEntry> {
        await Promise.resolve();
        yield { ts: 't', event: 'SENDING', rowIndex: 0, rowKey: 'A' };
        yield { ts: 't', event: 'SENT', rowIndex: 0, rowKey: 'A' };
      })(),
      undefined,
    );
    assert.deepEqual([...replayed.countByStatus()], [['SENT', 1]]);
  });
});

describe('RowLedger.record', () => {
  it('leaves the state untouched when the journal append fails', async () => {
    let failing = false;
    const ledger = new RowLedger({
      append: async (): Promise<void> => {
        await Promise.resolve();
        if (failing) throw new Error('ENOSPC: no space left on device');
      },
    });
    await ledger.record({ event: 'SENDING', rowIndex: 0, rowKey: 'A' });
    failing = true;

    await assert.rejects(ledger.record({ event: 'SENT', rowIndex: 0, rowKey: 'A', iun: 'I' }), /ENOSPC/);

    assert.equal(ledger.get(0)?.status, 'SENDING', 'memory matches what the journal holds');
    assert.deepEqual([...ledger.countByStatus()], [['SENDING', 1]]);
  });
});

describe('RowLedger.countByAcceptance', () => {
  it('counts acceptance from evidence, not from the status alone', async () => {
    const ledger = new RowLedger(undefined);
    await ledger.record({ event: 'SENT', rowIndex: 0, rowKey: 'A', iun: 'I' });
    await ledger.record({ event: 'SENT', rowIndex: 1, rowKey: 'B', iun: 'I' });
    await ledger.record({ event: 'SENT', rowIndex: 2, rowKey: 'C', iun: 'I' });
    assert.deepEqual([...ledger.countByAcceptance()], [['UNKNOWN', 3]]);

    await ledger.record({ event: 'ACCEPTED', rowIndex: 0, rowKey: 'A', iun: 'I' });
    await ledger.record({
      event: 'REQUEST_ID_NOT_FOUND',
      rowIndex: 1,
      rowKey: 'B',
      requestIdReason: 'WORKFLOW_ENDED:REQUEST_REFUSED',
      timelineAcceptance: 'REFUSED',
    });
    await ledger.record({ event: 'REQUEST_ID_NOT_FOUND', rowIndex: 2, rowKey: 'C', requestIdReason: 'TIMEOUT' });
    await ledger.record({ event: 'REQUEST_ID_FOUND', rowIndex: 0, rowKey: 'A', requestId: 'R' });

    assert.deepEqual([...ledger.countByAcceptance()].sort(), [
      ['ACCEPTED', 1],
      ['REFUSED', 1],
      ['UNKNOWN', 1],
    ]);
    assert.equal(ledger.countByStatus().get('REQUEST_ID_NOT_FOUND'), 2, 'same status, different acceptance');
  });
});

describe('Journal', () => {
  it('writes one segment per session and replays them in order, skipping a truncated line', async () => {
    const dir = await tempDir('dispatch-journal');
    const first = path.join(dir, 'session-1', 'journal.jsonl');
    const second = path.join(dir, 'session-2', 'journal.jsonl');
    await writeFixture(path.join(dir, 'session-1', '.keep'), '');
    await writeFixture(path.join(dir, 'session-2', '.keep'), '');

    const journal = await Journal.open(first);
    await journal.append({ ts: 't1', event: 'SENDING', ...ROW });
    await journal.append({ ts: 't2', event: 'SENT', ...ROW, notificationRequestId: 'N' });
    await journal.close();
    const content = await readFixture(first);
    await writeFixture(first, `${content ?? ''}{"ts":"t3","event":"ACCE`);

    const resumed = await Journal.open(second);
    await resumed.append({ ts: 't4', event: 'ACCEPTED', ...ROW });
    await resumed.close();

    const entries = await collect(Journal.entries([first, second]));
    assert.deepEqual(
      entries.map((entry) => entry.event),
      ['SENDING', 'SENT', 'ACCEPTED'],
    );
  });
});

describe('decideRowAction', () => {
  const state = (status: string, retryable?: boolean): RowState =>
    ({
      ...ROW,
      status,
      sendAttempts: 1,
      verifyChecks: 0,
      requestIdChecks: 0,
      warnings: [],
      ...(retryable !== undefined && { error: { code: 'E', message: 'm', retryable } }),
    }) as RowState;

  const policy = (
    retryFailed: boolean,
    retryUncertain: boolean,
    verify: boolean,
    requestId = false,
  ): RowActionPolicy => ({
    retryFailed,
    retryUncertain,
    verify,
    requestId,
  });

  it('maps resume states to actions', () => {
    assert.equal(decideRowAction(undefined, policy(false, false, true)), 'send');
    assert.equal(decideRowAction(state('SENDING'), policy(false, false, true)), 'send');
    assert.equal(decideRowAction(state('SEND_UNCERTAIN'), policy(false, false, true)), 'skip');
    assert.equal(decideRowAction(state('SEND_UNCERTAIN'), policy(false, true, true)), 'send');
    assert.equal(decideRowAction(state('SEND_FAILED', true), policy(false, false, true)), 'skip');
    assert.equal(decideRowAction(state('SEND_FAILED', true), policy(true, false, true)), 'send');
    assert.equal(decideRowAction(state('SEND_FAILED', false), policy(true, false, true)), 'skip');
    assert.equal(decideRowAction(state('SENT'), policy(false, false, true)), 'verify');
    assert.equal(decideRowAction(state('SENT'), policy(false, false, false)), 'skip');
    assert.equal(decideRowAction(state('VERIFY_TIMEOUT'), policy(false, false, true)), 'verify');
    assert.equal(
      decideRowAction(state('VERIFY_TIMEOUT'), policy(false, false, false, true)),
      'request-id',
      '--phases request-id still retrieves the requestId of a row whose verification timed out',
    );
    assert.equal(decideRowAction(state('VERIFY_TIMEOUT'), policy(false, false, false)), 'skip');
    const unknownIun = { ...state('REQUEST_ID_NOT_FOUND'), requestIdReason: 'IUN_UNKNOWN' };
    assert.equal(
      decideRowAction(unknownIun, policy(false, false, true, true)),
      'verify',
      'only verify can obtain the IUN',
    );
    assert.equal(decideRowAction(unknownIun, policy(false, false, false, true)), 'skip');
    const unknownIunAccepted = { ...unknownIun, acceptedAt: 't' };
    assert.equal(
      decideRowAction(unknownIunAccepted, policy(false, false, true, true)),
      'verify',
      'accepted, but the IUN is still missing: only verify obtains it',
    );
    assert.equal(decideRowAction(state('ACCEPTED'), policy(true, true, true)), 'skip');
    assert.equal(decideRowAction(state('INVALID'), policy(true, true, true)), 'skip');
  });

  it('routes rows with a known acceptance to the requestId phase', () => {
    const accepted = (status: string, requestIdReason?: string): RowState => ({
      ...state(status),
      acceptedAt: 't',
      ...(requestIdReason !== undefined && { requestIdReason }),
    });
    assert.equal(decideRowAction(state('SENT'), policy(false, false, false, true)), 'request-id');
    assert.equal(decideRowAction(state('ACCEPTED'), policy(false, false, true, true)), 'request-id');
    assert.equal(decideRowAction(accepted('REQUEST_ID_NOT_FOUND'), policy(false, false, true, true)), 'request-id');
    assert.equal(decideRowAction(accepted('REQUEST_ID_FOUND'), policy(false, false, true, true)), 'skip');
    const ended = accepted('REQUEST_ID_NOT_FOUND', 'WORKFLOW_ENDED:COMPLETELY_UNREACHABLE');
    assert.equal(decideRowAction(ended, policy(false, false, true, true)), 'skip', 'the workflow ended: final');
    assert.equal(
      decideRowAction(accepted('REQUEST_ID_NOT_FOUND', 'TIMEOUT'), policy(false, false, true, true)),
      'request-id',
    );
    const refusedPerTimeline: RowState = {
      ...state('REQUEST_ID_FOUND'),
      requestIdReason: 'FOUND',
      timelineAcceptance: 'REFUSED',
    };
    assert.equal(decideRowAction(refusedPerTimeline, policy(false, false, true, true)), 'skip', 'refused: final');
    assert.equal(decideRowAction(state('REFUSED'), policy(false, false, true, true)), 'skip');
  });

  it('verifies requestId outcomes whose acceptance is unknown before anything else', () => {
    // --phases request-id, or categories that precede the acceptance: the outcome proves nothing.
    const found = { ...state('REQUEST_ID_FOUND'), requestIdReason: 'FOUND' };
    assert.equal(decideRowAction(found, policy(false, false, true, true)), 'verify');
    assert.equal(decideRowAction(found, policy(false, false, true, false)), 'verify');
    assert.equal(decideRowAction(found, policy(false, false, false, true)), 'skip', 'no verify: nothing to do');
    const timedOut = { ...state('REQUEST_ID_NOT_FOUND'), requestIdReason: 'TIMEOUT' };
    assert.equal(decideRowAction(timedOut, policy(false, false, true, true)), 'verify');
    assert.equal(decideRowAction(timedOut, policy(false, false, false, true)), 'request-id', 'no verify: query again');
    const ended = { ...state('REQUEST_ID_NOT_FOUND'), requestIdReason: 'WORKFLOW_ENDED:VALIDATED_F24' };
    assert.equal(
      decideRowAction(ended, policy(false, false, true, true)),
      'verify',
      'an end category before acceptance',
    );
    assert.equal(decideRowAction(ended, policy(false, false, false, true)), 'skip', 'no verify: the workflow ended');
  });
});
