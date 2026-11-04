import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { MemorySink } from '../../__tests__/helpers/MemorySink.js';
import { tempDir, writeFixture } from '../../__tests__/helpers/testFiles.js';
import { InputReader } from '../../input/InputReader.js';
import { ObservedSink } from '../../journal/ObservedSink.js';
import type { JournalEntry } from '../../journal/JournalEntry.js';
import { RowLedger } from '../../journal/RowLedger.js';
import { QA_TEST_PROFILE } from '../../mapping/profiles/qaTestProfile.js';
import { RecordFactory } from '../../mapping/RecordFactory.js';
import type { DispatchRecord } from '../../model/DispatchRecord.js';
import type { RequestIdStage } from '../../requestId/RequestIdStage.js';
import type { SendStage } from '../../stages/SendStage.js';
import type { VerifyStage } from '../../stages/VerifyStage.js';
import { DispatchRun } from '../DispatchRun.js';
import { groupFailures, sendStatistics } from '../summarizeLedger.js';

/** Records which rows reach which stage. */
class Recorder {
  public readonly sent: string[] = [];
  public readonly verified: string[] = [];
  public readonly requestIds: string[] = [];

  public readonly sendStage = {
    send: async (record: DispatchRecord): Promise<void> => {
      await Promise.resolve();
      this.sent.push(record.rowKey);
    },
  } as unknown as SendStage;

  public readonly verifyStage = {
    schedule: (_rowIndex: number, rowKey: string): void => {
      this.verified.push(rowKey);
    },
    drain: async (): Promise<void> => Promise.resolve(),
  } as unknown as VerifyStage;

  public readonly requestIdStage = {
    schedule: (_rowIndex: number, rowKey: string): void => {
      this.requestIds.push(rowKey);
    },
    drain: async (): Promise<void> => Promise.resolve(),
  } as unknown as RequestIdStage;
}

const HEADER = 'ID_Scenario,Scenario,Destinatario,Denomination,CAP,Citta,Indirizzo,iun';

async function input(lines: ReadonlyArray<string>): Promise<InputReader> {
  const file = path.join(await tempDir('dispatch-run'), 'in.csv');
  await writeFixture(file, `${[HEADER, ...lines].join('\n')}\n`);
  return new InputReader({ filePath: file, format: 'csv' });
}

function factory(): RecordFactory {
  return new RecordFactory({
    profile: QA_TEST_PROFILE,
    cliValues: new Map(),
    environmentValues: new Map([
      ['sender.taxId', '00000000001'],
      ['sender.denomination', 'Comune'],
    ]),
    context: { documentsDir: '/docs', sharedDocumentAvailable: true },
  });
}

const NO_RETRY = { retryFailed: false, retryUncertain: false, verify: false, requestId: false } as const;

const row = (key: string, iun = ''): string => `${key},Test,RSSMRA80A01H501U,Mario,00100,Roma,Via Roma 1,${iun}`;

describe('DispatchRun', () => {
  it('routes each row by its journaled state on resume', async () => {
    const ledger = new RowLedger(undefined);
    await ledger.record({ event: 'SENT', rowIndex: 1, rowKey: 'S-1', notificationRequestId: 'N1', iun: 'I1' });
    await ledger.record({ event: 'ACCEPTED', rowIndex: 2, rowKey: 'S-2', notificationRequestId: 'N2', iun: 'I2' });
    await ledger.record({ event: 'REQUEST_ID_FOUND', rowIndex: 3, rowKey: 'S-3' });
    await ledger.record({ event: 'SEND_FAILED', rowIndex: 4, rowKey: 'S-4', error: { code: 'X', message: 'm' } });
    const recorder = new Recorder();

    await new DispatchRun({
      reader: await input([row('S-0'), row('S-1'), row('S-2'), row('S-3'), row('S-4')]),
      factory: factory(),
      ledger,
      sendStage: recorder.sendStage,
      verifyStage: recorder.verifyStage,
      requestIdStage: recorder.requestIdStage,
      policy: { retryFailed: false, retryUncertain: false, verify: true, requestId: true },
      failFast: false,
      controller: new AbortController(),
    }).execute();

    assert.deepEqual(recorder.sent, ['S-0']);
    assert.deepEqual(recorder.verified, ['S-1']);
    assert.deepEqual(recorder.requestIds, ['S-2']);
  });

  it('imports the identifiers of the input without the send phase', async () => {
    const entries: JournalEntry[] = [];
    const ledger = new RowLedger(new ObservedSink(new MemorySink(), (entry) => entries.push(entry)));
    const recorder = new Recorder();
    await new DispatchRun({
      reader: await input([row('S-0', 'PAYK-MWDR-ZUAZ-202601-K-1'), row('S-1')]),
      factory: factory(),
      ledger,
      requestIdStage: recorder.requestIdStage,
      policy: { retryFailed: false, retryUncertain: false, verify: false, requestId: true },
      failFast: false,
      controller: new AbortController(),
    }).execute();

    assert.deepEqual(recorder.requestIds, ['S-0']);
    assert.equal(ledger.get(0)?.notificationRequestId, Buffer.from('PAYK-MWDR-ZUAZ-202601-K-1').toString('base64'));
    assert.deepEqual(
      entries.map((entry) => entry.event),
      ['PRESET'],
      'the observer sees every transition',
    );
  });

  it('stops reading rows when the controller is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const recorder = new Recorder();
    await new DispatchRun({
      reader: await input([row('S-0')]),
      factory: factory(),
      ledger: new RowLedger(undefined),
      sendStage: recorder.sendStage,
      policy: NO_RETRY,
      failFast: false,
      controller,
    }).execute();
    assert.deepEqual(recorder.sent, []);
  });
});

describe('DispatchRun (failures and resume edge cases)', () => {
  /** Background stage whose drain records its order and takes a while. */
  function drainingStage(name: string, order: string[], failure?: Error): VerifyStage & RequestIdStage {
    return {
      schedule: (): void => undefined,
      drain: async (): Promise<void> => {
        await new Promise<void>((resolve) => setImmediate(resolve));
        order.push(name);
        if (failure !== undefined) throw failure;
      },
    } as unknown as VerifyStage & RequestIdStage;
  }

  it('stops the run and drains both stages before rethrowing a send failure', async () => {
    const controller = new AbortController();
    const order: string[] = [];
    const failing = {
      send: async (): Promise<void> => {
        await Promise.resolve();
        throw new Error('journal write failed');
      },
    } as unknown as SendStage;
    await assert.rejects(
      new DispatchRun({
        reader: await input([row('S-0'), row('S-1')]),
        factory: factory(),
        ledger: new RowLedger(undefined),
        sendStage: failing,
        verifyStage: drainingStage('verify', order),
        requestIdStage: drainingStage('request-id', order),
        policy: { retryFailed: false, retryUncertain: false, verify: true, requestId: true },
        failFast: false,
        controller,
      }).execute(),
      /journal write failed/,
    );
    assert.ok(controller.signal.aborted, 'the stages see the stop');
    assert.deepEqual(order, ['verify', 'request-id']);
  });

  it('still drains the requestId stage when the verification drain fails', async () => {
    const order: string[] = [];
    await assert.rejects(
      new DispatchRun({
        reader: await input([]),
        factory: factory(),
        ledger: new RowLedger(undefined),
        verifyStage: drainingStage('verify', order, new Error('verify failed')),
        requestIdStage: drainingStage('request-id', order),
        policy: { retryFailed: false, retryUncertain: false, verify: true, requestId: true },
        failFast: false,
        controller: new AbortController(),
      }).execute(),
      /verify failed/,
    );
    assert.deepEqual(order, ['verify', 'request-id']);
  });

  it('marks SEND_UNCERTAIN (MAPPING_CHANGED) a row left SENDING whose mapping now fails', async () => {
    const ledger = new RowLedger(undefined);
    await ledger.record({ event: 'SENDING', rowIndex: 0, rowKey: 'S-0', attempt: 1 });
    const recorder = new Recorder();
    await new DispatchRun({
      reader: await input(['S-0,Test,RSSMRA80A01H501U,Mario,12,Roma,Via Roma 1,']),
      factory: factory(),
      ledger,
      sendStage: recorder.sendStage,
      policy: NO_RETRY,
      failFast: false,
      controller: new AbortController(),
    }).execute();
    assert.deepEqual(recorder.sent, []);
    assert.equal(ledger.get(0)?.status, 'SEND_UNCERTAIN');
    assert.equal(ledger.get(0)?.error?.code, 'MAPPING_CHANGED');
  });

  it('imports a revalidated preset row instead of leaving it PENDING forever', async () => {
    const ledger = new RowLedger(undefined);
    await ledger.record({ event: 'ROW_INVALID', rowIndex: 0, rowKey: 'S-0', error: { code: 'X', message: 'm' } });
    await ledger.record({ event: 'ROW_REVALIDATED', rowIndex: 0, rowKey: 'S-0' });
    const recorder = new Recorder();
    await new DispatchRun({
      reader: await input([row('S-0', 'PAYK-MWDR-ZUAZ-202601-K-1')]),
      factory: factory(),
      ledger,
      requestIdStage: recorder.requestIdStage,
      policy: { retryFailed: false, retryUncertain: false, verify: false, requestId: true },
      failFast: false,
      controller: new AbortController(),
    }).execute();
    assert.deepEqual(recorder.requestIds, ['S-0']);
    assert.equal(ledger.get(0)?.status, 'SENT');
  });
});

describe('summarizeLedger', () => {
  it('groups failures by code and computes the send rate', async () => {
    const ledger = new RowLedger(undefined);
    for (let i = 0; i < 7; i++) {
      await ledger.record({
        event: 'SEND_FAILED',
        rowIndex: i,
        rowKey: `F-${i}`,
        error: { code: 'BAD', message: 'x' },
      });
    }
    await ledger.record({
      event: 'ROW_INVALID',
      rowIndex: 9,
      rowKey: 'I-9',
      error: { code: 'MISSING_FIELD', message: 'y' },
    });
    const groups = groupFailures(ledger.values(), 5);
    assert.deepEqual(
      groups.map((group) => [group.code, group.count, group.rowKeys.length]),
      [
        ['BAD', 7, 5],
        ['MISSING_FIELD', 1, 1],
      ],
    );

    const states = [0, 1, 2].map((i) => ({
      rowIndex: i,
      rowKey: `S-${i}`,
      status: 'SENT' as const,
      sentAt: new Date(Date.UTC(2026, 10, 3, 10, 0, i)).toISOString(),
      sendAttempts: 1,
      verifyChecks: 0,
      requestIdChecks: 0,
      warnings: [],
    }));
    const statistics = sendStatistics(states);
    assert.equal(statistics.sent, 3);
    assert.equal(statistics.averageRate, 1);
    assert.deepEqual(sendStatistics([]), { sent: 0 });
  });
});
