import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';

import { tempDir, writeFixture } from '../../__tests__/helpers/testFiles.js';
import { LocalDocumentInspector } from '../../documents/LocalDocumentInspector.js';
import { InputReader } from '../../input/InputReader.js';
import type { InputRow } from '../../input/InputRow.js';
import { RowLedger } from '../../journal/RowLedger.js';
import { QA_TEST_PROFILE } from '../../mapping/profiles/qaTestProfile.js';
import { RecordFactory } from '../../mapping/RecordFactory.js';
import type { RowActionPolicy } from '../RowActionPolicy.js';
import { runValidationPass } from '../runValidationPass.js';
import type { ValidationPassOptions } from '../ValidationPassOptions.js';

const HEADER = 'ID_Scenario,Scenario,Destinatario,Denomination,CAP,Citta,Indirizzo,iun';
const POLICY: RowActionPolicy = { retryFailed: false, retryUncertain: false, verify: true, requestId: false };

const row = (key: string, zip = '00100', iun = ''): string =>
  `${key},Test,RSSMRA80A01H501U,Mario,${zip},Roma,Via Roma 1,${iun}`;

async function options(
  lines: ReadonlyArray<string>,
  ledger: RowLedger,
  overrides: Partial<ValidationPassOptions> = {},
): Promise<ValidationPassOptions> {
  const file = path.join(tempDir('dispatch-validation'), 'in.csv');
  await writeFixture(file, `${[HEADER, ...lines].join('\n')}\n`);
  return {
    reader: new InputReader({ filePath: file, format: 'csv' }),
    factory: new RecordFactory({
      profile: QA_TEST_PROFILE,
      cliValues: new Map(),
      environmentValues: new Map([
        ['sender.taxId', '00000000001'],
        ['sender.denomination', 'Comune'],
      ]),
      context: { documentsDir: '/docs', sharedDocumentAvailable: true },
    }),
    inspector: new LocalDocumentInspector(os.tmpdir()),
    ledger,
    runId: 'run',
    policy: POLICY,
    ...(QA_TEST_PROFILE.rowKeyColumn !== undefined && { rowKeyColumn: QA_TEST_PROFILE.rowKeyColumn }),
    ...overrides,
  };
}

describe('runValidationPass', () => {
  it('brings back to PENDING a row recorded INVALID by a previous session that now validates', async () => {
    const ledger = new RowLedger(undefined);
    await ledger.record({ event: 'ROW_INVALID', rowIndex: 0, rowKey: 'S-0', error: { code: 'X', message: 'm' } });
    const summary = await runValidationPass(await options([row('S-0')], ledger));
    assert.equal(ledger.get(0)?.status, 'PENDING');
    assert.equal(ledger.get(0)?.error, undefined);
    assert.equal(summary.validRows, 1);
    assert.equal(summary.invalidRows, 0);
    assert.equal(summary.rowsToSend, 1);
  });

  it('on resume counts only the rows this session sends or processes', async () => {
    const ledger = new RowLedger(undefined);
    await ledger.record({ event: 'SENT', rowIndex: 1, rowKey: 'S-1', notificationRequestId: 'N1', iun: 'I1' });
    await ledger.record({ event: 'ACCEPTED', rowIndex: 2, rowKey: 'S-2', iun: 'I2' });
    await ledger.record({ event: 'SENDING', rowIndex: 3, rowKey: 'S-3' });
    await ledger.record({ event: 'SENDING', rowIndex: 4, rowKey: 'S-4' });
    const summary = await runValidationPass(
      await options([row('S-0'), row('S-1'), row('S-2'), row('S-3'), row('S-4', '12')], ledger),
    );
    assert.equal(summary.validRows, 5, 'valid rows, already processed included');
    assert.equal(summary.invalidRows, 0, 'a row past SEND never becomes INVALID');
    assert.equal(summary.rowsToSend, 2, 'S-0 (new) and S-3 (reconciled); S-4 no longer maps');
    assert.equal(summary.rowsToProcess, 3, 'plus S-1 to verify; S-2 is done');
    assert.equal(summary.products.get('AR'), 2, 'plan figures describe the rows to send');
  });

  it('keys an invalid preset row by its key column without building a full record', async () => {
    const ledger = new RowLedger(undefined);
    const summary = await runValidationPass(
      await options([row('S-0', '00100', 'PAYK-MWDR-ZUAZ-202601-K-1'), row('S-1', '00100', 'not-an-iun')], ledger, {
        presetMode: true,
        policy: { ...POLICY, verify: false, requestId: true },
      }),
    );
    assert.equal(summary.validRows, 1);
    assert.equal(summary.rowsToProcess, 1);
    assert.equal(summary.rowsToSend, 0);
    assert.equal(ledger.get(1)?.status, 'INVALID');
    assert.equal(ledger.get(1)?.rowKey, 'S-1');
  });
  it('stops before the next row once the signal is aborted', async (t) => {
    const ledger = new RowLedger(undefined);
    const controller = new AbortController();
    const opts = await options([row('S-0'), row('S-1', '12'), row('S-2')], ledger, { signal: controller.signal });
    const create = opts.factory.create.bind(opts.factory);
    t.mock.method(opts.factory, 'create', (input: InputRow) => {
      controller.abort(); // stop() while the first row is being validated
      return create(input);
    });

    const summary = await runValidationPass(opts);

    assert.equal(summary.totalRows, 1, 'only the row in progress is validated');
    assert.equal(ledger.get(1), undefined, 'the invalid row after the stop is not journaled');
  });

  it('validates nothing when the signal is already aborted', async () => {
    const ledger = new RowLedger(undefined);
    const controller = new AbortController();
    controller.abort();

    const summary = await runValidationPass(await options([row('S-0', '12')], ledger, { signal: controller.signal }));

    assert.equal(summary.totalRows, 0);
    assert.equal(ledger.get(0), undefined);
  });
});
