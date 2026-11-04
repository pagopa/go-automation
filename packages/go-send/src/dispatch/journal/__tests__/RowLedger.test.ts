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

describe('Journal', () => {
  it('writes one segment per session and replays them in order, skipping a truncated line', async () => {
    const dir = tempDir('dispatch-journal');
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
    assert.equal(decideRowAction(state('ACCEPTED'), policy(true, true, true)), 'skip');
    assert.equal(decideRowAction(state('INVALID'), policy(true, true, true)), 'skip');
  });

  it('routes rows to the requestId phase', () => {
    assert.equal(decideRowAction(state('SENT'), policy(false, false, false, true)), 'request-id');
    assert.equal(decideRowAction(state('ACCEPTED'), policy(false, false, true, true)), 'request-id');
    assert.equal(decideRowAction(state('REQUEST_ID_NOT_FOUND'), policy(false, false, true, true)), 'request-id');
    assert.equal(decideRowAction(state('REQUEST_ID_FOUND'), policy(false, false, true, true)), 'skip');
    const ended = { ...state('REQUEST_ID_NOT_FOUND'), requestIdReason: 'WORKFLOW_ENDED:COMPLETELY_UNREACHABLE' };
    assert.equal(decideRowAction(ended, policy(false, false, true, true)), 'skip', 'the workflow ended: final');
    const timedOut = { ...state('REQUEST_ID_NOT_FOUND'), requestIdReason: 'TIMEOUT' };
    assert.equal(decideRowAction(timedOut, policy(false, false, true, true)), 'request-id');
    assert.equal(decideRowAction(state('REFUSED'), policy(false, false, true, true)), 'skip');
  });
});
