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
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';

import { GOCSVListExporter } from '../GOCSVListExporter.js';
import { useTempDir } from '../../../__tests__/helpers/createTempDir.js';

describe('GOCSVListExporter — stream error handling', () => {
  const tmp = useTempDir('go-csv-list-exporter-');

  it('emits export:error exactly once, without an uncaughtException, when fd open fails late', async () => {
    // fs.createWriteStream returns synchronously but open(2) fails a tick later
    // for a missing parent directory: the canonical "late error". export() also
    // closes the writer a second time from its catch path.
    const exporter = new GOCSVListExporter<{ a: number }>({ outputPath: tmp.file('does', 'not', 'exist', 'out.csv') });

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
      await assert.rejects(exporter.export([{ a: 1 }, { a: 2 }]), { code: 'ENOENT' });
      // Drain a couple of I/O ticks so any stray duplicate emission / late
      // rejection would have time to fire before we assert counts.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('uncaughtException', uncaughtHandler);
    }

    assert.strictEqual(errors.length, 1, `expected exactly one export:error, got ${String(errors.length)}`);
    assert.strictEqual((errors[0] as NodeJS.ErrnoException).code, 'ENOENT');
    assert.strictEqual(uncaught.length, 0, `expected no uncaughtException, got ${String(uncaught.length)}`);
  });

  it('is idempotent on close — second close does not re-emit export:completed', async () => {
    const outputPath = tmp.file('out.csv');
    const exporter = new GOCSVListExporter<{ a: number }>({ outputPath });

    let completedCount = 0;
    exporter.on('export:completed', () => {
      completedCount++;
    });

    const writer = await exporter.exportStream();
    await writer.append({ a: 1 });
    await writer.close();
    await writer.close(); // repeat call — must be a no-op

    assert.strictEqual(completedCount, 1, `expected exactly one export:completed, got ${String(completedCount)}`);
    assert.ok((await fs.readFile(outputPath, 'utf-8')).includes('1'), 'expected exported row to be written');
  });
});
