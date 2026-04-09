/**
 * Tests for GOBinaryFileExporter
 *
 * Verifies binary file writing with auto-directory creation,
 * Buffer and Uint8Array inputs, and file overwrite.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { GOBinaryFileExporter } from '../GOBinaryFileExporter.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-binary-file-exporter-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('GOBinaryFileExporter', () => {
  it('writes a Buffer to file', async () => {
    const outputPath = path.join(tmpDir, 'output.bin');
    const exporter = new GOBinaryFileExporter({ outputPath });

    const data = Buffer.from([0x50, 0x44, 0x46, 0x2d, 0x31]); // "PDF-1"
    await exporter.export(data);

    const content = await fs.readFile(outputPath);
    assert.deepStrictEqual(content, data);
  });

  it('writes a Uint8Array to file', async () => {
    const outputPath = path.join(tmpDir, 'output.bin');
    const exporter = new GOBinaryFileExporter({ outputPath });

    const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic bytes
    await exporter.export(data);

    const content = await fs.readFile(outputPath);
    assert.deepStrictEqual(new Uint8Array(content), data);
  });

  it('creates parent directories if they do not exist', async () => {
    const outputPath = path.join(tmpDir, 'deep', 'nested', 'dir', 'file.bin');
    const exporter = new GOBinaryFileExporter({ outputPath });

    const data = Buffer.from('binary content');
    await exporter.export(data);

    const content = await fs.readFile(outputPath);
    assert.deepStrictEqual(content, data);
  });

  it('overwrites existing file', async () => {
    const outputPath = path.join(tmpDir, 'overwrite.bin');
    await fs.writeFile(outputPath, Buffer.from('old data'));

    const exporter = new GOBinaryFileExporter({ outputPath });
    const newData = Buffer.from('new data');
    await exporter.export(newData);

    const content = await fs.readFile(outputPath);
    assert.deepStrictEqual(content, newData);
  });

  it('writes large buffer without truncation', async () => {
    const outputPath = path.join(tmpDir, 'large.bin');
    const exporter = new GOBinaryFileExporter({ outputPath });

    const data = Buffer.alloc(1024 * 1024, 0xab); // 1 MB
    await exporter.export(data);

    const content = await fs.readFile(outputPath);
    assert.strictEqual(content.length, data.length);
    assert.deepStrictEqual(content, data);
  });

  it('writes empty buffer', async () => {
    const outputPath = path.join(tmpDir, 'empty.bin');
    const exporter = new GOBinaryFileExporter({ outputPath });

    await exporter.export(Buffer.alloc(0));

    const stat = await fs.stat(outputPath);
    assert.strictEqual(stat.size, 0);
  });
});
