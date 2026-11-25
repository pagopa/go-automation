import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs/promises';

import { GOFileListExporter } from '../GOFileListExporter.js';
import { useTempDir } from '../../../__tests__/helpers/createTempDir.js';

interface ThrowingWriteStream {
  write(chunk: string): boolean;
  once(event: 'drain', handler: () => void): void;
}

interface ExporterWithWriteStream {
  writeStream?: ThrowingWriteStream;
}

describe('GOFileListExporter', () => {
  const tmp = useTempDir('go-common-file-list-exporter-');

  it('exports items in batch mode, creates directories and emits lifecycle events', async () => {
    const outputPath = tmp.file('nested', 'items.txt');
    const exporter = new GOFileListExporter({
      outputPath,
      lineSeparator: '|',
    });
    const startedModes: string[] = [];
    const exportedItems: string[] = [];
    const progressPercentages: number[] = [];
    let completedTotal = 0;

    exporter.on('export:started', (event) => {
      startedModes.push(event.mode);
    });
    exporter.on('export:item', (event) => {
      exportedItems.push(String(event.item));
    });
    exporter.on('export:progress', (event) => {
      if (event.percentage !== undefined) {
        progressPercentages.push(event.percentage);
      }
    });
    exporter.on('export:completed', (event) => {
      completedTotal = event.totalItems;
    });

    await exporter.export(['alpha', 'beta']);

    assert.strictEqual(await fs.readFile(outputPath, 'utf-8'), 'alpha|beta|');
    assert.deepStrictEqual(startedModes, ['batch']);
    assert.deepStrictEqual(exportedItems, ['alpha', 'beta']);
    assert.deepStrictEqual(progressPercentages, [50, 100]);
    assert.strictEqual(completedTotal, 2);
  });

  it('exports items in stream mode and reports progress without a known total', async () => {
    const outputPath = tmp.file('stream.txt');
    const exporter = new GOFileListExporter({ outputPath });
    const progressTotals: (number | undefined)[] = [];
    const startedModes: string[] = [];

    exporter.on('export:started', (event) => {
      startedModes.push(event.mode);
    });
    exporter.on('export:progress', (event) => {
      progressTotals.push(event.totalItems);
    });

    const writer = await exporter.exportStream();
    await writer.append('one');
    await writer.append('two');
    await writer.close();

    assert.strictEqual(await fs.readFile(outputPath, 'utf-8'), 'one\ntwo\n');
    assert.deepStrictEqual(startedModes, ['stream']);
    assert.deepStrictEqual(progressTotals, [undefined, undefined]);
  });

  it('emits export errors and rejects when writing fails', async () => {
    const exporter = new GOFileListExporter({ outputPath: tmp.file('items.txt') });
    const errors: string[] = [];
    exporter.on('export:error', (event) => {
      errors.push(event.error.message);
    });

    const writer = await exporter.exportStream();
    await writer.close();
    const mutableExporter = exporter as unknown as ExporterWithWriteStream;
    mutableExporter.writeStream = {
      write() {
        throw new Error('write failed');
      },
      once() {},
    };

    await assert.rejects(writer.append('alpha'), /write failed/);
    assert.deepStrictEqual(errors, ['write failed']);
  });
});
