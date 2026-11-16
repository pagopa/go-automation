/**
 * Tests for GOJSONFileExporter
 *
 * Verifies single-object JSON file writing with pretty/compact modes,
 * custom indentation, encoding, and directory auto-creation.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { GOJSONFileExporter } from '../GOJSONFileExporter.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-json-file-exporter-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('GOJSONFileExporter', () => {
  it('writes a simple object as pretty-printed JSON (default)', async () => {
    const outputPath = path.join(tmpDir, 'output.json');
    const exporter = new GOJSONFileExporter({ outputPath });

    const data = { name: 'test', value: 42 };
    await exporter.export(data);

    const content = await fs.readFile(outputPath, 'utf-8');
    assert.strictEqual(content, JSON.stringify(data, null, 2));
  });

  it('writes a nested object preserving structure', async () => {
    const outputPath = path.join(tmpDir, 'nested.json');
    const exporter = new GOJSONFileExporter({ outputPath });

    const data = {
      metadata: { version: '1.0.0' },
      steps: [
        { id: 'step1', status: 'completed' },
        { id: 'step2', status: 'failed' },
      ],
    };
    await exporter.export(data);

    const content = await fs.readFile(outputPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    assert.deepStrictEqual(parsed, data);
  });

  it('writes compact JSON when pretty is false', async () => {
    const outputPath = path.join(tmpDir, 'compact.json');
    const exporter = new GOJSONFileExporter({ outputPath, pretty: false });

    const data = { a: 1, b: 2 };
    await exporter.export(data);

    const content = await fs.readFile(outputPath, 'utf-8');
    assert.strictEqual(content, '{"a":1,"b":2}');
  });

  it('uses custom indentation', async () => {
    const outputPath = path.join(tmpDir, 'indent4.json');
    const exporter = new GOJSONFileExporter({ outputPath, indent: 4 });

    const data = { key: 'value' };
    await exporter.export(data);

    const content = await fs.readFile(outputPath, 'utf-8');
    assert.strictEqual(content, JSON.stringify(data, null, 4));
  });

  it('creates parent directories if they do not exist', async () => {
    const outputPath = path.join(tmpDir, 'deep', 'nested', 'dir', 'output.json');
    const exporter = new GOJSONFileExporter({ outputPath });

    await exporter.export({ created: true });

    const content = await fs.readFile(outputPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    assert.deepStrictEqual(parsed, { created: true });
  });

  it('writes an array as top-level value', async () => {
    const outputPath = path.join(tmpDir, 'array.json');
    const exporter = new GOJSONFileExporter({ outputPath });

    const data = [1, 2, 3];
    await exporter.export(data);

    const content = await fs.readFile(outputPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    assert.deepStrictEqual(parsed, data);
  });

  it('writes a string as top-level value', async () => {
    const outputPath = path.join(tmpDir, 'string.json');
    const exporter = new GOJSONFileExporter({ outputPath, pretty: false });

    await exporter.export('hello');

    const content = await fs.readFile(outputPath, 'utf-8');
    assert.strictEqual(content, '"hello"');
  });

  it('writes null as top-level value', async () => {
    const outputPath = path.join(tmpDir, 'null.json');
    const exporter = new GOJSONFileExporter({ outputPath, pretty: false });

    await exporter.export(null);

    const content = await fs.readFile(outputPath, 'utf-8');
    assert.strictEqual(content, 'null');
  });

  it('throws on circular reference', async () => {
    const outputPath = path.join(tmpDir, 'circular.json');
    const exporter = new GOJSONFileExporter({ outputPath });

    const circular: Record<string, unknown> = { name: 'loop' };
    circular['self'] = circular;

    await assert.rejects(async () => exporter.export(circular), TypeError);
  });

  it('overwrites existing file', async () => {
    const outputPath = path.join(tmpDir, 'overwrite.json');
    await fs.writeFile(outputPath, '{"old": true}', 'utf-8');

    const exporter = new GOJSONFileExporter({ outputPath });
    await exporter.export({ new: true });

    const content = await fs.readFile(outputPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    assert.deepStrictEqual(parsed, { new: true });
  });
});
