import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { GO_EXPORT_FORMATS } from '@pagopa/go-common/exporters';
import type { GOExportFormat } from '@pagopa/go-common/exporters';

import { createRowListExporter } from '../libs/createRowListExporter.js';

const ROWS: ReadonlyArray<Record<string, unknown>> = [
  { table: 'a', missing: 3 },
  { table: 'b', missing: 0 },
];

/** Exports ROWS into a directory that does not exist yet and returns what was written. */
async function exportRows(format: GOExportFormat): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'row-list-exporter-'));
  const outputPath = path.join(dir, 'not-yet', `rows.${format}`);

  await createRowListExporter(outputPath, format).export(ROWS);

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- percorso costruito dalla mkdtemp di questo test.
  return await readFile(outputPath, 'utf8');
}

describe('createRowListExporter', () => {
  it('writes every format, creating the output directory', async () => {
    for (const format of GO_EXPORT_FORMATS) {
      const written = await exportRows(format);
      assert.match(written, /missing|"missing"/, format);
    }
  });

  it('writes csv with a header and txt tab-separated', async () => {
    assert.match(await exportRows('csv'), /^table,missing/);
    assert.match(await exportRows('txt'), /^table\tmissing/);
  });

  it('writes json as an array and jsonl one row per line', async () => {
    assert.equal((JSON.parse(await exportRows('json')) as unknown[]).length, 2);
    assert.equal((await exportRows('jsonl')).trim().split('\n').length, 2);
  });
});
