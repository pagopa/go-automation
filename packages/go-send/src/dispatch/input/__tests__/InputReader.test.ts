import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { tempDir, writeFixture } from '../../__tests__/helpers/testFiles.js';
import { InputReader } from '../InputReader.js';
import type { InputRow } from '../InputRow.js';

async function readAll(reader: InputReader): Promise<ReadonlyArray<InputRow>> {
  const rows: InputRow[] = [];
  for await (const row of reader.rows()) rows.push(row);
  return rows;
}

describe('InputReader', () => {
  it('infers the format from the extension', () => {
    assert.equal(InputReader.formatFromPath('/x/a.CSV'), 'csv');
    assert.equal(InputReader.formatFromPath('/x/a.json'), 'json');
    assert.equal(InputReader.formatFromPath('/x/a.jsonl'), 'jsonl');
    assert.equal(InputReader.formatFromPath('/x/a.ndjson'), 'jsonl');
    assert.equal(InputReader.formatFromPath('/x/a.txt'), undefined);
  });

  it('reads CSV rows with index, delimiter and skipped lines', async () => {
    const file = path.join(tempDir('dispatch-input'), 'in.csv');
    await writeFixture(file, 'titolo del file\nID;Nome\n1;Mario\n2;Anna\n');
    const rows = await readAll(new InputReader({ filePath: file, format: 'csv', delimiter: ';', skipRows: 1 }));
    assert.deepEqual(
      rows.map((row) => [row.rowIndex, row.values['ID'], row.values['Nome']]),
      [
        [0, '1', 'Mario'],
        [1, '2', 'Anna'],
      ],
    );
  });

  it('flattens nested JSON with dots and keeps the original item', async () => {
    const file = path.join(tempDir('dispatch-input'), 'in.json');
    const item = { id: 7, recipient: { taxId: 'RSS', address: { zip: '00100' } }, tags: ['a', 'b'], active: true };
    await writeFixture(file, JSON.stringify([item]));
    const [row] = await readAll(new InputReader({ filePath: file, format: 'json' }));
    assert.deepEqual(row?.values, {
      id: '7',
      'recipient.taxId': 'RSS',
      'recipient.address.zip': '00100',
      tags: 'a|b',
      active: 'true',
    });
    assert.deepEqual(row?.original, item);
  });

  it('reads JSONL line by line', async () => {
    const file = path.join(tempDir('dispatch-input'), 'in.jsonl');
    await writeFixture(file, '{"iun":"A"}\n{"iun":"B"}\n');
    const rows = await readAll(new InputReader({ filePath: file, format: 'jsonl' }));
    assert.deepEqual(
      rows.map((row) => row.values['iun']),
      ['A', 'B'],
    );
  });
});
