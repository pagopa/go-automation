import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { GOBinaryFileExporter } from '../../../exporters/binary/GOBinaryFileExporter.js';
import { GOBinaryFileImporter } from '../GOBinaryFileImporter.js';
import { GOFileTooLargeError } from '../GOFileTooLargeError.js';

function tempFile(name: string): string {
  return path.join(os.tmpdir(), `go-binary-importer-${randomUUID()}`, name);
}

describe('GOBinaryFileImporter', () => {
  it('reads the bytes written by GOBinaryFileExporter', async () => {
    const file = tempFile('data.bin');
    const content = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
    await new GOBinaryFileExporter({ outputPath: file }).export(content);
    assert.deepEqual(await new GOBinaryFileImporter({ inputPath: file }).import(), content);
  });

  it('returns undefined for a missing optional file and throws otherwise', async () => {
    const missing = tempFile('missing.bin');
    assert.equal(await new GOBinaryFileImporter({ inputPath: missing, optional: true }).import(), undefined);
    await assert.rejects(new GOBinaryFileImporter({ inputPath: missing }).import(), /ENOENT/);
  });

  it('refuses a file larger than maxBytes without reading it', async () => {
    const file = tempFile('big.bin');
    await new GOBinaryFileExporter({ outputPath: file }).export(Buffer.alloc(10));
    await assert.rejects(
      new GOBinaryFileImporter({ inputPath: file, maxBytes: 9 }).import(),
      (error: unknown) => error instanceof GOFileTooLargeError && error.size === 10 && error.maxBytes === 9,
    );
    assert.equal((await new GOBinaryFileImporter({ inputPath: file, maxBytes: 10 }).import())?.length, 10);
  });
});
