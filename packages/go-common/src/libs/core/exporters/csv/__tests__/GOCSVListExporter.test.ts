/**
 * Regression tests for GOCSVListExporter stream error-capture and idempotent close.
 *
 * The CSV exporter pipes a csv-stringify Stringifier into fs.WriteStream. A fault
 * on either (e.g. ENOENT on fd open for a path with a missing parent directory)
 * surfaces asynchronously AFTER createWriteStream returns. Without the permanent
 * capture listener installed in initializeStream(), that error would escape as
 * an uncaughtException. And because export()'s catch path calls writer.close() a
 * second time as cleanup, a naive implementation would emit export:error twice
 * for the same fault.
 *
 * These tests pin those invariants:
 *  - async writeStream errors do not surface as uncaughtException
 *  - export:error is emitted exactly once per fault
 *  - closeStream() is idempotent (no duplicate export:completed on repeat close)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { GOCSVListExporter } from '../GOCSVListExporter.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'go-csv-list-exporter-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('GOCSVListExporter — stream error handling', () => {
  it('emits export:error exactly once when fd open fails (missing parent dir)', async () => {
    // Missing intermediate directories — fs.createWriteStream returns synchronously
    // but the underlying open(2) fails async, emitting 'error' on the writeStream
    // a tick later. This is the canonical "late error" we want to cover.
    const missingParent = path.join(tmpDir, 'does', 'not', 'exist', 'out.csv');
    const exporter = new GOCSVListExporter<{ a: number }>({ outputPath: missingParent });

    const errors: Error[] = [];
    exporter.on('export:error', ({ error }) => {
      errors.push(error);
    });

    const uncaught: unknown[] = [];
    const uncaughtHandler = (err: unknown): void => {
      uncaught.push(err);
    };
    process.on('uncaughtException', uncaughtHandler);

    try {
      await assert.rejects(
        exporter.export([{ a: 1 }]),
        (err: unknown) => err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT',
      );

      // Drain a couple of I/O ticks so any stray duplicate emission / late
      // rejection would have time to fire before we assert counts.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('uncaughtException', uncaughtHandler);
    }

    assert.strictEqual(errors.length, 1, `expected exactly one export:error, got ${errors.length}`);
    assert.strictEqual(uncaught.length, 0, `expected no uncaughtException, got ${uncaught.length}`);
  });

  it('is idempotent on close — second close does not re-emit export:completed', async () => {
    const outputPath = path.join(tmpDir, 'out.csv');
    const exporter = new GOCSVListExporter<{ a: number }>({ outputPath });

    let completedCount = 0;
    exporter.on('export:completed', () => {
      completedCount++;
    });

    const writer = await exporter.exportStream();
    await writer.append({ a: 1 });
    await writer.close();
    await writer.close(); // repeat call — must be a no-op

    assert.strictEqual(completedCount, 1, `expected exactly one export:completed, got ${completedCount}`);

    // Sanity: file was written.
    const content = await fs.readFile(outputPath, 'utf-8');
    assert.ok(content.includes('1'), 'expected exported row to be written');
  });

  it('emits export:error exactly once on fd-open failure even when closeStream is called again from the catch path', async () => {
    // export() itself calls writer.close() a second time inside its catch block
    // as a belt-and-suspenders cleanup. The first close rejects with the
    // captured streamError; the cached closePromise must make the second close
    // resolve silently so the same fault isn't emitted twice.
    const missingParent = path.join(tmpDir, 'missing', 'out.csv');
    const exporter = new GOCSVListExporter<{ a: number }>({ outputPath: missingParent });

    const errors: Error[] = [];
    exporter.on('export:error', ({ error }) => {
      errors.push(error);
    });

    await assert.rejects(exporter.export([{ a: 1 }, { a: 2 }]));
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(errors.length, 1);
    // Same error object both times would still be "once"; checking identity here
    // would over-specify. Just confirm the kind.
    assert.ok(errors[0] instanceof Error);
    assert.strictEqual((errors[0] as NodeJS.ErrnoException).code, 'ENOENT');
  });
});
