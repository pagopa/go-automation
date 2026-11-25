import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOCSVListImporter } from '../GOCSVListImporter.js';
import { collectAsync } from '../../../__tests__/helpers/collectAsync.js';
import { useTempDir } from '../../../__tests__/helpers/createTempDir.js';

const importer = (): GOCSVListImporter<Record<string, string>> =>
  new GOCSVListImporter<Record<string, string>>({ hasHeaders: true, delimiter: ',' });

describe('GOCSVListImporter.importStream', () => {
  const tmp = useTempDir('go-csv-list-importer-');

  it('streams the rows keyed by header', async () => {
    const source = await tmp.write('rows.csv', 'id,name\n1,"Rossi, Mario"\n2,Bianchi\n');

    assert.deepEqual(await collectAsync(importer().importStream(source)), [
      { id: '1', name: 'Rossi, Mario' },
      { id: '2', name: 'Bianchi' },
    ]);
  });

  it('rejects a missing file instead of crashing the process', async () => {
    const missing = tmp.file('missing.csv');

    await assert.rejects(collectAsync(importer().importStream(missing)), { code: 'ENOENT' });
    await assert.rejects(importer().import(missing), { code: 'ENOENT' });
  });

  it('rejects a malformed CSV', async () => {
    const source = await tmp.write('broken.csv', 'id,name\n1,"unterminated\n');

    await assert.rejects(collectAsync(importer().importStream(source)));
  });

  it('stops when the consumer stops early', async () => {
    const lines = ['id', ...Array.from({ length: 5000 }, (_, i) => String(i))].join('\n');
    const source = await tmp.write('many.csv', `${lines}\n`);
    const firstTwo: string[] = [];

    for await (const row of importer().importStream(source)) {
      firstTwo.push(row['id'] ?? '');
      if (firstTwo.length === 2) break;
    }

    assert.deepEqual(firstTwo, ['0', '1']);
  });
});
