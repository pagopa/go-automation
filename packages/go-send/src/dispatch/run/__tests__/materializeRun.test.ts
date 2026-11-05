import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { readFixture, tempDir, writeFixture } from '../../__tests__/helpers/testFiles.js';
import { InputReader } from '../../input/InputReader.js';
import { RowLedger } from '../../journal/RowLedger.js';
import { materializeRun } from '../materializeRun.js';

const IUN = 'PAYK-MWDR-ZUAZ-202601-K-1';

async function materialize(ledger: RowLedger, rows: number, onlySuccess: boolean): Promise<ReadonlyArray<string>> {
  const dir = await tempDir('dispatch-materialize');
  const input = path.join(dir, 'in.csv');
  const lines = ['key', ...Array.from({ length: rows }, (_, i) => `K-${i}`)];
  await writeFixture(input, `${lines.join('\n')}\n`);
  const outputPath = path.join(dir, 'output.csv');
  await materializeRun({
    reader: new InputReader({ filePath: input, format: 'csv' }),
    ledger,
    format: 'csv',
    outputPath,
    reportPath: path.join(dir, 'report.csv'),
    rowKeyColumn: 'key',
    includeStatus: true,
    onlySuccess,
    unsentStatus: 'PENDING',
  });
  return ((await readFixture(outputPath)) ?? '').trim().split('\n');
}

describe('materializeRun', () => {
  it('keeps only successful notifications in the success-only output: not refused, timed out or without requestId', async () => {
    const ledger = new RowLedger(undefined);
    const sent = { notificationRequestId: 'N', iun: IUN } as const;
    await ledger.record({ event: 'SENT', rowIndex: 0, rowKey: 'K-0', ...sent });
    await ledger.record({ event: 'SENT', rowIndex: 1, rowKey: 'K-1', ...sent });
    await ledger.record({ event: 'ACCEPTED', rowIndex: 1, rowKey: 'K-1', iun: IUN });
    await ledger.record({ event: 'SENT', rowIndex: 2, rowKey: 'K-2', ...sent });
    await ledger.record({ event: 'REFUSED', rowIndex: 2, rowKey: 'K-2', error: { code: 'REFUSED', message: 'm' } });
    await ledger.record({ event: 'SENT', rowIndex: 3, rowKey: 'K-3', ...sent });
    await ledger.record({ event: 'VERIFY_TIMEOUT', rowIndex: 3, rowKey: 'K-3' });
    await ledger.record({ event: 'REQUEST_ID_FOUND', rowIndex: 4, rowKey: 'K-4', iun: IUN, requestId: 'R' });
    await ledger.record({ event: 'REQUEST_ID_NOT_FOUND', rowIndex: 5, rowKey: 'K-5', iun: IUN });
    await ledger.record({ event: 'SENT', rowIndex: 6, rowKey: 'K-6', requestId: 'PNMAN.R6' }); // direct: no IUN
    await ledger.record({ event: 'SEND_FAILED', rowIndex: 7, rowKey: 'K-7', error: { code: 'X', message: 'm' } });
    await ledger.record({ event: 'SENT', rowIndex: 8, rowKey: 'K-8', ...sent });
    await ledger.record({
      event: 'REQUEST_ID_NOT_FOUND',
      rowIndex: 8,
      rowKey: 'K-8',
      requestIdReason: 'WORKFLOW_ENDED:REQUEST_REFUSED',
    });

    const success = await materialize(ledger, 9, true);
    assert.deepEqual(
      success.slice(1).map((line) => line.split(',')[0]),
      ['K-0', 'K-1', 'K-4', 'K-6'],
      'K-5 (REQUEST_ID_NOT_FOUND) is a problem: the run looked for its requestId',
    );

    const all = await materialize(ledger, 9, false);
    assert.match(all[3] ?? '', /^K-2,,,REFUSED,/, 'a refused notification has no IUN in the output');
    assert.match(all[4] ?? '', new RegExp(`^K-3,${IUN},`));
    assert.match(all[9] ?? '', /^K-8,,,REQUEST_ID_NOT_FOUND,/, 'refused per the timeline: no IUN either');
  });
});
