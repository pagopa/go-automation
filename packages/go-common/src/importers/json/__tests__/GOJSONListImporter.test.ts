import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOJSONListImporter } from '../GOJSONListImporter.js';
import { collectAsync } from '../../../__tests__/helpers/collectAsync.js';
import { useTempDir } from '../../../__tests__/helpers/createTempDir.js';

describe('GOJSONListImporter.importStream', () => {
  const tmp = useTempDir('go-json-list-importer-');

  it('streams the elements of a top-level array, larger than one read chunk', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: i, note: `riga ${i}, con "virgolette" e ]` }));
    const source = await tmp.write('rows.json', JSON.stringify(rows, null, 2));

    assert.deepEqual(await collectAsync(new GOJSONListImporter<{ id: number }>().importStream(source)), rows);
  });

  it('yields the first elements before reading the end of the file', async () => {
    // ~140KB: more than one 64KiB read chunk before the unterminated tail.
    const head = Array.from({ length: 4000 }, (_, i) => JSON.stringify({ id: i, pad: 'x'.repeat(20) })).join(',');
    const source = await tmp.write('broken.json', `[${head}, {"id": "unterminated`);
    const seen: number[] = [];

    await assert.rejects(async () => {
      for await (const item of new GOJSONListImporter<{ id: number }>().importStream(source)) seen.push(item.id);
    }, /not closed/);
    assert.equal(seen.length, 4000, 'every complete element came out before the error');
  });

  it('applies the row validator and skipInvalidItems to streamed elements', async () => {
    const source = await tmp.write('mixed.json', '[{"ok": true}, {"ok": false}, {"ok": true}]');
    const importer = new GOJSONListImporter<{ ok: boolean }>({
      skipInvalidItems: true,
      rowValidator: (item) => {
        if ((item as { ok: boolean }).ok !== true) throw new Error('invalid');
      },
    });

    assert.equal((await collectAsync(importer.importStream(source))).length, 2);
  });

  it('stops reading when the consumer stops early', async () => {
    const source = await tmp.write('many.json', JSON.stringify(Array.from({ length: 10000 }, (_, i) => i)));
    const firstThree: number[] = [];

    for await (const item of new GOJSONListImporter<number>().importStream(source)) {
      firstThree.push(item);
      if (firstThree.length === 3) break;
    }

    assert.deepEqual(firstThree, [0, 1, 2]);
  });

  it('keeps the whole-document behaviour for a top-level object and for jsonPath', async () => {
    const single = await tmp.write('single.json', '{"id": 1}');
    const nested = await tmp.write('nested.json', '{"data": {"items": [{"id": 1}, {"id": 2}]}}');

    assert.deepEqual(await collectAsync(new GOJSONListImporter().importStream(single)), [{ id: 1 }]);
    assert.deepEqual(await collectAsync(new GOJSONListImporter({ jsonPath: 'data.items' }).importStream(nested)), [
      { id: 1 },
      { id: 2 },
    ]);
  });

  it('rejects an invalid element and an empty file', async () => {
    const badElement = await tmp.write('bad.json', '[{"id": 1}, {id: 2}]');
    const empty = await tmp.write('empty.json', '');

    await assert.rejects(collectAsync(new GOJSONListImporter().importStream(badElement)), /Invalid JSON array element/);
    await assert.rejects(collectAsync(new GOJSONListImporter().importStream(empty)), SyntaxError);
  });

  it('reports progress without a total and a final 100%', async () => {
    const source = await tmp.write('progress.json', '[1, 2, 3]');
    const importer = new GOJSONListImporter<number>();
    const percentages: (number | undefined)[] = [];
    importer.on('import:progress', (event) => {
      percentages.push(event.percentage);
    });

    await collectAsync(importer.importStream(source));

    assert.deepEqual(percentages, [undefined, undefined, undefined, 100]);
  });
});
