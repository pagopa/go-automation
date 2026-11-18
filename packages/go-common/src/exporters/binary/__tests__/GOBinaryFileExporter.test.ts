import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';

import { GOBinaryFileExporter } from '../GOBinaryFileExporter.js';
import { useTempDir } from '../../../__tests__/helpers/createTempDir.js';

describe('GOBinaryFileExporter', () => {
  const tmp = useTempDir('go-binary-file-exporter-');

  it('writes Buffer and Uint8Array bytes, creating missing parent directories', async () => {
    const cases: ReadonlyArray<readonly [name: string, data: Buffer | Uint8Array]> = [
      ['deep/nested/buffer.bin', Buffer.from([0x50, 0x44, 0x46, 0x2d, 0x31])],
      ['uint8.bin', new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
      ['empty.bin', Buffer.alloc(0)],
    ];
    for (const [name, data] of cases) {
      const outputPath = tmp.file(name);
      await new GOBinaryFileExporter({ outputPath }).export(data);
      assert.deepStrictEqual(new Uint8Array(await fs.readFile(outputPath)), new Uint8Array(data), name);
    }
  });

  it('overwrites an existing file', async () => {
    const outputPath = await tmp.write('overwrite.bin', 'old data, longer than the new one');

    await new GOBinaryFileExporter({ outputPath }).export(Buffer.from('new data'));

    assert.strictEqual(await fs.readFile(outputPath, 'utf8'), 'new data');
  });
});
