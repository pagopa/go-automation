import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { GOCSVListImporter } from '../GOCSVListImporter.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-csv-list-importer-'));
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

const importer = (): GOCSVListImporter<Record<string, string>> =>
  new GOCSVListImporter<Record<string, string>>({ hasHeaders: true, delimiter: ',' });

describe('GOCSVListImporter.importStream', () => {
  it('streams the rows keyed by header', async () => {
    const source = await file('rows.csv', 'id,name\n1,"Rossi, Mario"\n2,Bianchi\n');

    assert.deepEqual(await collect(importer().importStream(source)), [
      { id: '1', name: 'Rossi, Mario' },
      { id: '2', name: 'Bianchi' },
    ]);
  });

  it('rejects a missing file instead of crashing the process', async () => {
    const missing = path.join(tmpDir, 'missing.csv');

    await assert.rejects(collect(importer().importStream(missing)), { code: 'ENOENT' });
    await assert.rejects(importer().import(missing), { code: 'ENOENT' });
  });

  it('rejects a malformed CSV', async () => {
    const source = await file('broken.csv', 'id,name\n1,"unterminated\n');

    await assert.rejects(collect(importer().importStream(source)));
  });

  it('stops when the consumer stops early', async () => {
    const lines = ['id', ...Array.from({ length: 5000 }, (_, i) => String(i))].join('\n');
    const source = await file('many.csv', `${lines}\n`);
    const firstTwo: string[] = [];

    for await (const row of importer().importStream(source)) {
      firstTwo.push(row['id'] ?? '');
      if (firstTwo.length === 2) break;
    }

    assert.deepEqual(firstTwo, ['0', '1']);
  });
});
