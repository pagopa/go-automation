import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';

import { GOJSONFileExporter } from '../GOJSONFileExporter.js';
import type { GOJSONFileExporterOptions } from '../GOJSONFileExporterOptions.js';
import { useTempDir } from '../../../__tests__/helpers/createTempDir.js';

describe('GOJSONFileExporter', () => {
  const tmp = useTempDir('go-json-file-exporter-');

  it('formats according to pretty and indent', async () => {
    const data = { a: 1, b: [2] };
    const cases: ReadonlyArray<readonly [options: Omit<GOJSONFileExporterOptions, 'outputPath'>, expected: string]> = [
      [{}, JSON.stringify(data, null, 2)],
      [{ indent: 4 }, JSON.stringify(data, null, 4)],
      [{ pretty: false }, '{"a":1,"b":[2]}'],
      [{ pretty: false, indent: 4 }, '{"a":1,"b":[2]}'],
    ];
    for (const [options, expected] of cases) {
      const outputPath = tmp.file('format.json');
      await new GOJSONFileExporter({ outputPath, ...options }).export(data);
      assert.strictEqual(await fs.readFile(outputPath, 'utf-8'), expected, JSON.stringify(options));
    }
  });

  it('creates missing parent directories and overwrites an existing file', async () => {
    const outputPath = await tmp.write('deep/nested/output.json', '{"old": true}');

    await new GOJSONFileExporter({ outputPath }).export({ new: true });

    assert.deepStrictEqual(JSON.parse(await fs.readFile(outputPath, 'utf-8')), { new: true });
    const freshPath = tmp.file('other/dir/fresh.json');
    await new GOJSONFileExporter({ outputPath: freshPath, pretty: false }).export(null);
    assert.strictEqual(await fs.readFile(freshPath, 'utf-8'), 'null');
  });

  it('rejects a circular structure', async () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular['self'] = circular;

    await assert.rejects(new GOJSONFileExporter({ outputPath: tmp.file('circular.json') }).export(circular), TypeError);
  });
});
