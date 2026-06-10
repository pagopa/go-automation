import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { GOEventEmitterBase } from '@go-automation/go-common/core';
import type {
  GOListExporter,
  GOListExporterEventMap,
  GOListExporterStreamWriter,
  GOListImporter,
  GOListImporterEventMap,
  GOListImporterResult,
} from '@go-automation/go-common/core';

import type { SENDNotifications } from '../../../SENDNotifications.js';
import type { SENDAttachmentResult } from '../../../services/attachment/models/SENDAttachmentResult.js';
import { SENDAttachmentUploadWorker } from '../SENDAttachmentUploadWorker.js';
import type { SENDAttachmentUploadRow } from '../SENDAttachmentUploadRow.js';
import type { SENDAttachmentUploadWorkerErrorEvent } from '../SENDAttachmentUploadWorkerEvents.js';

type ScriptedRow =
  | { kind: 'valid'; row: SENDAttachmentUploadRow }
  | { kind: 'invalid'; rawData: Record<string, string>; message: string };

class FakeImporter
  extends GOEventEmitterBase<GOListImporterEventMap<SENDAttachmentUploadRow>>
  implements GOListImporter<SENDAttachmentUploadRow>
{
  consumedItems = 0;

  constructor(
    private readonly rows: ScriptedRow[],
    private readonly skipInvalidItems: boolean,
  ) {
    super();
  }

  async import(): Promise<GOListImporterResult<SENDAttachmentUploadRow>> {
    await Promise.resolve();
    throw new Error('not implemented in fake');
  }

  async *importStream(_source: string): AsyncGenerator<SENDAttachmentUploadRow, void, unknown> {
    await Promise.resolve();
    let processedItems = 0;
    for (const scripted of this.rows) {
      processedItems += 1;
      this.consumedItems += 1;

      if (scripted.kind === 'invalid') {
        const error = new Error(scripted.message);
        this.emit('import:error', {
          itemIndex: processedItems,
          itemData: scripted.rawData,
          message: scripted.message,
          error,
        });
        if (!this.skipInvalidItems) {
          throw error;
        }
        continue;
      }

      yield scripted.row;
    }
  }
}

class FakeExporter
  extends GOEventEmitterBase<GOListExporterEventMap>
  implements GOListExporter<Record<string, unknown>>
{
  readonly appended: Record<string, unknown>[] = [];
  closeCalls = 0;
  failOnAppendNumber: number | undefined;

  async export(): Promise<void> {
    await Promise.resolve();
    throw new Error('not implemented in fake');
  }

  async exportStream(): Promise<GOListExporterStreamWriter<Record<string, unknown>>> {
    await Promise.resolve();
    return {
      append: async (item: Record<string, unknown>): Promise<void> => {
        await Promise.resolve();
        if (this.failOnAppendNumber !== undefined && this.appended.length + 1 === this.failOnAppendNumber) {
          throw new Error('disk full');
        }
        this.appended.push(item);
      },
      close: async (): Promise<void> => {
        await Promise.resolve();
        this.closeCalls += 1;
      },
    };
  }
}

interface FakeSdkOptions {
  readonly failUploadForPath?: string;
  readonly uploadDelayMsForPath?: Record<string, number>;
}

function createFakeSdk(options: FakeSdkOptions = {}): SENDNotifications {
  const readFileFromDisk = mock.fn(async (filePath: string): Promise<Buffer> => {
    await Promise.resolve();
    if (filePath.includes('missing')) {
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    }
    return Buffer.from(`content-of-${filePath}`);
  });

  const upload = mock.fn(async (buffer: Buffer, _contentType: string): Promise<SENDAttachmentResult> => {
    const filePath = buffer.toString().replace('content-of-', '');
    const delay = options.uploadDelayMsForPath?.[filePath];
    if (delay !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (options.failUploadForPath === filePath) {
      throw new Error(`upload rejected for ${filePath}`);
    }
    return {
      ref: { key: `key-${filePath}`, versionToken: 'v1' },
      digests: { sha256: `sha-${filePath}` },
      buffer,
    };
  });

  return { attachment: { readFileFromDisk, upload } } as unknown as SENDNotifications;
}

function validRow(filePath: string, extra: Record<string, unknown> = {}): ScriptedRow {
  return { kind: 'valid', row: { filePath, ...extra } };
}

describe('SENDAttachmentUploadWorker', () => {
  it('uploads every row and exports records in input order with uniform keys', async () => {
    const importer = new FakeImporter([validRow('a.pdf', { title: 'A' }), validRow('b.pdf', { title: 'B' })], false);
    const exporter = new FakeExporter();
    const worker = new SENDAttachmentUploadWorker(importer, createFakeSdk());

    const result = await worker.process('input.csv', { exporter, concurrency: 2 });

    assert.strictEqual(result.stats.totalRows, 2);
    assert.strictEqual(result.stats.uploadedFiles, 2);
    assert.strictEqual(result.stats.failedRows, 0);
    assert.strictEqual(result.stoppedOnError, false);
    assert.strictEqual(result.errors, undefined);

    assert.strictEqual(exporter.appended.length, 2);
    assert.strictEqual(exporter.closeCalls, 1);
    const first = exporter.appended[0]!;
    assert.strictEqual(first['filePath'], 'a.pdf');
    assert.strictEqual(first['title'], 'A');
    assert.strictEqual(first['status'], 'uploaded');
    assert.strictEqual(first['fileKey'], 'key-a.pdf');
    assert.strictEqual(first['versionToken'], 'v1');
    assert.strictEqual(first['sha256'], 'sha-a.pdf');
    assert.strictEqual(first['contentType'], 'application/pdf');
    assert.strictEqual(first['error'], '');
    assert.ok(typeof first['uploadedAt'] === 'string' && first['uploadedAt'] !== '');
    assert.deepStrictEqual(Object.keys(first), Object.keys(exporter.appended[1]!));
  });

  it('prefers _originalRow fields when building export records', async () => {
    const importer = new FakeImporter(
      [validRow('a.pdf', { _originalRow: { file: 'a.pdf', nota: 'originale' } })],
      false,
    );
    const exporter = new FakeExporter();
    const worker = new SENDAttachmentUploadWorker(importer, createFakeSdk());

    await worker.process('input.csv', { exporter });

    const record = exporter.appended[0]!;
    assert.strictEqual(record['nota'], 'originale');
    assert.strictEqual(record['file'], 'a.pdf');
    assert.strictEqual(record['_originalRow'], undefined);
  });

  it('continues after an upload failure when skipOnError=true and exports the failed row', async () => {
    const importer = new FakeImporter([validRow('a.pdf'), validRow('b.pdf'), validRow('c.pdf')], true);
    const exporter = new FakeExporter();
    const worker = new SENDAttachmentUploadWorker(importer, createFakeSdk({ failUploadForPath: 'b.pdf' }));

    const result = await worker.process('input.csv', { exporter, skipOnError: true, concurrency: 1 });

    assert.strictEqual(result.stats.totalRows, 3);
    assert.strictEqual(result.stats.uploadedFiles, 2);
    assert.strictEqual(result.stats.failedRows, 1);
    assert.strictEqual(result.stoppedOnError, false);
    assert.strictEqual(result.errors?.length, 1);
    assert.strictEqual(result.errors?.[0]?.phase, 'upload');

    assert.strictEqual(exporter.appended.length, 3);
    const failed = exporter.appended[1]!;
    assert.strictEqual(failed['status'], 'failed');
    assert.strictEqual(failed['fileKey'], '');
    assert.match(String(failed['error']), /upload rejected for b\.pdf/);
  });

  it('stops consuming rows at the first failure when skipOnError=false', async () => {
    const importer = new FakeImporter(
      [validRow('a.pdf'), validRow('broken.pdf'), validRow('c.pdf'), validRow('d.pdf')],
      false,
    );
    const exporter = new FakeExporter();
    const worker = new SENDAttachmentUploadWorker(importer, createFakeSdk({ failUploadForPath: 'broken.pdf' }));

    const result = await worker.process('input.csv', { exporter, skipOnError: false, concurrency: 1 });

    assert.strictEqual(result.stoppedOnError, true);
    assert.strictEqual(result.stats.uploadedFiles, 1);
    assert.strictEqual(result.stats.failedRows, 1);
    assert.ok(importer.consumedItems <= 3, `expected early stop, consumed ${importer.consumedItems}`);

    assert.strictEqual(exporter.appended.length, 2);
    assert.strictEqual(exporter.appended[0]!['status'], 'uploaded');
    assert.strictEqual(exporter.appended[1]!['status'], 'failed');
    assert.strictEqual(exporter.closeCalls, 1, 'export stream must be closed even on early stop');
  });

  it('exports invalid import rows at their input position when skipOnError=true', async () => {
    const importer = new FakeImporter(
      [
        validRow('a.pdf'),
        { kind: 'invalid', rawData: { filePath: '', nota: 'riga rotta' }, message: "missing or empty 'filePath'" },
        validRow('c.pdf'),
      ],
      true,
    );
    const exporter = new FakeExporter();
    const worker = new SENDAttachmentUploadWorker(importer, createFakeSdk());
    const errorEvents: SENDAttachmentUploadWorkerErrorEvent[] = [];
    worker.on('worker:error', (event) => {
      errorEvents.push(event);
    });

    const result = await worker.process('input.csv', { exporter, skipOnError: true, concurrency: 1 });

    assert.strictEqual(result.stats.totalRows, 3);
    assert.strictEqual(result.stats.uploadedFiles, 2);
    assert.strictEqual(result.stats.failedRows, 1);
    assert.strictEqual(errorEvents.length, 1);
    assert.strictEqual(errorEvents[0]?.error.phase, 'import');

    assert.strictEqual(exporter.appended.length, 3);
    const importFailed = exporter.appended[1]!;
    assert.strictEqual(importFailed['status'], 'failed');
    assert.strictEqual(importFailed['nota'], 'riga rotta');
    assert.match(String(importFailed['error']), /missing or empty/);
    assert.strictEqual(exporter.appended[2]!['status'], 'uploaded');
  });

  it('stops gracefully on an invalid import row when skipOnError=false', async () => {
    const importer = new FakeImporter(
      [validRow('a.pdf'), { kind: 'invalid', rawData: { filePath: '' }, message: 'invalid row' }, validRow('c.pdf')],
      false,
    );
    const exporter = new FakeExporter();
    const worker = new SENDAttachmentUploadWorker(importer, createFakeSdk());

    const result = await worker.process('input.csv', { exporter, skipOnError: false, concurrency: 2 });

    assert.strictEqual(result.stoppedOnError, true);
    assert.strictEqual(result.stats.totalRows, 2);
    assert.strictEqual(result.stats.failedRows, 1);
    assert.strictEqual(importer.consumedItems, 2, 'third row must not be consumed');

    assert.strictEqual(exporter.appended.length, 2);
    assert.strictEqual(exporter.appended[0]!['status'], 'uploaded');
    assert.strictEqual(exporter.appended[1]!['status'], 'failed');
    assert.strictEqual(exporter.closeCalls, 1);
  });

  it('preserves input order in the export even when uploads complete out of order', async () => {
    const importer = new FakeImporter([validRow('slow.pdf'), validRow('fast.pdf'), validRow('mid.pdf')], false);
    const exporter = new FakeExporter();
    const worker = new SENDAttachmentUploadWorker(
      importer,
      createFakeSdk({ uploadDelayMsForPath: { 'slow.pdf': 30, 'fast.pdf': 1, 'mid.pdf': 10 } }),
    );

    const result = await worker.process('input.csv', { exporter, concurrency: 3 });

    assert.strictEqual(result.stats.uploadedFiles, 3);
    assert.deepStrictEqual(
      exporter.appended.map((record) => record['filePath']),
      ['slow.pdf', 'fast.pdf', 'mid.pdf'],
    );
  });

  it('resolves the content type from row, extension, then default', async () => {
    const importer = new FakeImporter(
      [
        validRow('explicit.bin', { contentType: 'application/octet-stream' }),
        validRow('inferred.json'),
        validRow('fallback.dat'),
      ],
      false,
    );
    const exporter = new FakeExporter();
    const worker = new SENDAttachmentUploadWorker(importer, createFakeSdk());

    await worker.process('input.csv', { exporter, concurrency: 1, defaultContentType: 'application/zip' });

    assert.strictEqual(exporter.appended[0]!['contentType'], 'application/octet-stream');
    assert.strictEqual(exporter.appended[1]!['contentType'], 'application/json');
    assert.strictEqual(exporter.appended[2]!['contentType'], 'application/zip');
  });

  it('fails the row with a read phase error when the content type cannot be determined', async () => {
    const importer = new FakeImporter([validRow('unknown.dat')], true);
    const exporter = new FakeExporter();
    const worker = new SENDAttachmentUploadWorker(importer, createFakeSdk());

    const result = await worker.process('input.csv', { exporter, skipOnError: true });

    assert.strictEqual(result.stats.failedRows, 1);
    assert.strictEqual(result.errors?.[0]?.phase, 'read');
    assert.match(result.errors?.[0]?.message ?? '', /Cannot determine content type/);
    assert.strictEqual(exporter.appended[0]!['status'], 'failed');
  });

  it('fails the row with a read phase error when the file is missing', async () => {
    const importer = new FakeImporter([validRow('missing.pdf'), validRow('b.pdf')], true);
    const exporter = new FakeExporter();
    const worker = new SENDAttachmentUploadWorker(importer, createFakeSdk());

    const result = await worker.process('input.csv', { exporter, skipOnError: true, concurrency: 1 });

    assert.strictEqual(result.stats.uploadedFiles, 1);
    assert.strictEqual(result.errors?.[0]?.phase, 'read');
    assert.match(result.errors?.[0]?.message ?? '', /ENOENT/);
  });

  it('keeps only scalar data in upload results (no buffer retained)', async () => {
    const importer = new FakeImporter([validRow('a.pdf')], false);
    const worker = new SENDAttachmentUploadWorker(importer, createFakeSdk());

    const result = await worker.process('input.csv', {});

    assert.strictEqual(result.uploads.length, 1);
    const upload = result.uploads[0]!;
    assert.ok(!('buffer' in upload), 'upload result must not retain the file buffer');
    assert.strictEqual(upload.fileSizeBytes, Buffer.from('content-of-a.pdf').length);
  });

  it('rejects when the export stream fails, regardless of skipOnError', async () => {
    const importer = new FakeImporter([validRow('a.pdf'), validRow('b.pdf')], true);
    const exporter = new FakeExporter();
    exporter.failOnAppendNumber = 2;
    const worker = new SENDAttachmentUploadWorker(importer, createFakeSdk());

    await assert.rejects(worker.process('input.csv', { exporter, skipOnError: true, concurrency: 1 }), /disk full/);
    assert.strictEqual(exporter.closeCalls, 1, 'export stream must still be closed');
  });

  it('rejects on a fatal source error not tied to a row', async () => {
    class BrokenImporter extends FakeImporter {
      override async *importStream(_source: string): AsyncGenerator<SENDAttachmentUploadRow, void, unknown> {
        await Promise.resolve();
        yield { filePath: 'a.pdf' };
        throw new Error('unexpected end of stream');
      }
    }
    const importer = new BrokenImporter([], false);
    const exporter = new FakeExporter();
    const worker = new SENDAttachmentUploadWorker(importer, createFakeSdk());

    await assert.rejects(worker.process('input.csv', { exporter }), /unexpected end of stream/);
    assert.strictEqual(exporter.appended.length, 1, 'rows processed before the failure are exported');
    assert.strictEqual(exporter.closeCalls, 1);
  });
});
