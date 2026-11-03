import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

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

async function collect(importer: GOBinaryFileImporter): Promise<ReadonlyArray<Buffer>> {
  const chunks: Buffer[] = [];
  for await (const chunk of importer.importStream()) chunks.push(chunk);
  return chunks;
}

describe('GOBinaryFileImporter.importStream', () => {
  it('yields the content in chunks, in order', async () => {
    const file = tempFile('large.bin');
    // Larger than the 64 KiB read buffer: more than one chunk.
    const content = Buffer.alloc(200 * 1024, 0);
    for (let i = 0; i < content.length; i++) content[i] = i % 251;
    await new GOBinaryFileExporter({ outputPath: file }).export(content);

    const chunks = await collect(new GOBinaryFileImporter({ inputPath: file }));
    assert.ok(chunks.length > 1, `chunks: ${chunks.length}`);
    assert.deepEqual(Buffer.concat(chunks), content);

    const hash = createHash('sha256');
    for await (const chunk of new GOBinaryFileImporter({ inputPath: file }).importStream()) hash.update(chunk);
    assert.equal(hash.digest('hex'), createHash('sha256').update(content).digest('hex'));
  });

  it('yields nothing for an empty file', async () => {
    const file = tempFile('empty.bin');
    await new GOBinaryFileExporter({ outputPath: file }).export(Buffer.alloc(0));
    assert.equal(Buffer.concat(await collect(new GOBinaryFileImporter({ inputPath: file }))).length, 0);
  });

  it('yields nothing for a missing optional file and throws otherwise', async () => {
    const missing = tempFile('missing.bin');
    assert.deepEqual(await collect(new GOBinaryFileImporter({ inputPath: missing, optional: true })), []);
    await assert.rejects(collect(new GOBinaryFileImporter({ inputPath: missing })), /ENOENT/);
  });

  it('refuses a file larger than maxBytes before the first chunk', async () => {
    const file = tempFile('big.bin');
    await new GOBinaryFileExporter({ outputPath: file }).export(Buffer.alloc(10));
    await assert.rejects(
      collect(new GOBinaryFileImporter({ inputPath: file, maxBytes: 9 })),
      (error: unknown) => error instanceof GOFileTooLargeError && error.size === 10 && error.maxBytes === 9,
    );
    assert.equal(Buffer.concat(await collect(new GOBinaryFileImporter({ inputPath: file, maxBytes: 10 }))).length, 10);
  });

  it('closes the file when the iteration stops early', async () => {
    const file = tempFile('early.bin');
    await new GOBinaryFileExporter({ outputPath: file }).export(Buffer.alloc(200 * 1024));
    for await (const chunk of new GOBinaryFileImporter({ inputPath: file }).importStream()) {
      assert.ok(chunk.length > 0);
      break;
    }
    // Stopping early ends the generator cleanly; the file can be read again.
    assert.equal(Buffer.concat(await collect(new GOBinaryFileImporter({ inputPath: file }))).length, 200 * 1024);
  });
});
