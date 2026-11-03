import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import type { RowState } from '../../model/RowState.js';
import { decideRowAction } from '../../run/decideRowAction.js';
import { MemorySink } from '../../__tests__/helpers/MemorySink.js';
import { readFixture, tempDir, writeFixture } from '../../__tests__/helpers/testFiles.js';
import { applyJournalEntry } from '../applyJournalEntry.js';
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

    const replayed = RowLedger.replay(sink.entries, undefined);
    assert.deepEqual(replayed.get(3), ledger.get(3));
    assert.equal(replayed.recordedUploads()[0]?.key, 'k');
    assert.equal(replayed.countByStatus().get('SENT'), 1);
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

    const entries = await Journal.read([first, second]);
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
      warnings: [],
      ...(retryable !== undefined && { error: { code: 'E', message: 'm', retryable } }),
    }) as RowState;

  it('maps resume states to actions', () => {
    assert.equal(decideRowAction(undefined, false, false, true), 'send');
    assert.equal(decideRowAction(state('SENDING'), false, false, true), 'send');
    assert.equal(decideRowAction(state('SEND_UNCERTAIN'), false, false, true), 'skip');
    assert.equal(decideRowAction(state('SEND_UNCERTAIN'), false, true, true), 'send');
    assert.equal(decideRowAction(state('SEND_FAILED', true), false, false, true), 'skip');
    assert.equal(decideRowAction(state('SEND_FAILED', true), true, false, true), 'send');
    assert.equal(decideRowAction(state('SEND_FAILED', false), true, false, true), 'skip');
    assert.equal(decideRowAction(state('SENT'), false, false, true), 'verify');
    assert.equal(decideRowAction(state('SENT'), false, false, false), 'skip');
    assert.equal(decideRowAction(state('VERIFY_TIMEOUT'), false, false, true), 'verify');
    assert.equal(decideRowAction(state('ACCEPTED'), true, true, true), 'skip');
    assert.equal(decideRowAction(state('INVALID'), true, true, true), 'skip');
  });
});
