import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { GOJSONListImporter } from '../GOJSONListImporter.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-json-list-importer-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function file(name: string, content: string): Promise<string> {
  const filePath = path.join(tmpDir, name);
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of items) result.push(item);
  return result;
}

describe('GOJSONListImporter.importStream', () => {
  it('streams the elements of a top-level array, larger than one read chunk', async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({ id: i, note: `riga ${i}, con "virgolette" e ]` }));
    const source = await file('rows.json', JSON.stringify(rows, null, 2));

    const items = await collect(new GOJSONListImporter<{ id: number }>().importStream(source));

    assert.deepEqual(items, rows);
  });

  it('yields the first elements before reading the end of the file', async () => {
    const head = Array.from({ length: 20000 }, (_, i) => JSON.stringify({ id: i, pad: 'x'.repeat(20) })).join(',');
    const source = await file('broken.json', `[${head}, {"id": "unterminated`);
    const importer = new GOJSONListImporter<{ id: number }>();
    const seen: number[] = [];

    await assert.rejects(async () => {
      for await (const item of importer.importStream(source)) seen.push(item.id);
    }, /not closed/);
    assert.equal(seen.length, 20000, 'every complete element came out before the error');
  });

  it('applies the row validator and skipInvalidItems to streamed elements', async () => {
    const source = await file('mixed.json', '[{"ok": true}, {"ok": false}, {"ok": true}]');
    const importer = new GOJSONListImporter<{ ok: boolean }>({
      skipInvalidItems: true,
      rowValidator: (item) => {
        if ((item as { ok: boolean }).ok !== true) throw new Error('invalid');
      },
    });

    assert.equal((await collect(importer.importStream(source))).length, 2);
  });

  it('stops reading when the consumer stops early', async () => {
    const source = await file('many.json', JSON.stringify(Array.from({ length: 10000 }, (_, i) => i)));
    const firstThree: number[] = [];

    for await (const item of new GOJSONListImporter<number>().importStream(source)) {
      firstThree.push(item);
      if (firstThree.length === 3) break;
    }

    assert.deepEqual(firstThree, [0, 1, 2]);
  });

  it('keeps the whole-document behaviour for a top-level object and for jsonPath', async () => {
    const single = await file('single.json', '{"id": 1}');
    const nested = await file('nested.json', '{"data": {"items": [{"id": 1}, {"id": 2}]}}');

    assert.deepEqual(await collect(new GOJSONListImporter().importStream(single)), [{ id: 1 }]);
    assert.deepEqual(await collect(new GOJSONListImporter({ jsonPath: 'data.items' }).importStream(nested)), [
      { id: 1 },
      { id: 2 },
    ]);
  });

  it('rejects an invalid element and an empty file', async () => {
    const badElement = await file('bad.json', '[{"id": 1}, {id: 2}]');
    const empty = await file('empty.json', '');

    await assert.rejects(collect(new GOJSONListImporter().importStream(badElement)), /Invalid JSON array element/);
    await assert.rejects(collect(new GOJSONListImporter().importStream(empty)), SyntaxError);
  });

  it('reports progress without a total and a final 100%', async () => {
    const source = await file('progress.json', '[1, 2, 3]');
    const importer = new GOJSONListImporter<number>();
    const percentages: (number | undefined)[] = [];
    importer.on('import:progress', (event) => {
      percentages.push(event.percentage);
    });

    await collect(importer.importStream(source));

    assert.deepEqual(percentages, [undefined, undefined, undefined, 100]);
  });
});
