import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import * as path from 'node:path';

import { GORateLimiter } from '@go-automation/go-common/core';

import type { SENDPreloadRequest } from '../../../services/attachment/models/SENDPreloadRequest.js';
import type { SENDPreloadResponse } from '../../../services/attachment/models/SENDPreloadResponse.js';
import { httpError } from '../../__tests__/helpers/FakeB2BApi.js';
import { MemorySink } from '../../__tests__/helpers/MemorySink.js';
import { tempDir, writeFixture } from '../../__tests__/helpers/testFiles.js';
import { VirtualClock } from '../../__tests__/helpers/VirtualClock.js';
import { RowLedger } from '../../journal/RowLedger.js';
import { DispatchError } from '../../DispatchError.js';
import { DocumentResolver } from '../DocumentResolver.js';
import { toDocumentFailure } from '../toDocumentFailure.js';
import type { InspectedDocument } from '../InspectedDocument.js';
import { isInspectionFailure } from '../isInspectionFailure.js';
import { LocalDocumentInspector, MAX_DOCUMENT_BYTES } from '../LocalDocumentInspector.js';
import type { SafeStorageGateway } from '../SafeStorageGateway.js';
import { UploadError } from '../UploadError.js';
import { UploadStage } from '../UploadStage.js';

class FakeGateway implements SafeStorageGateway {
  public readonly preloads: ReadonlyArray<SENDPreloadRequest>[] = [];
  public readonly puts: string[] = [];
  public preloadFailure: Error | undefined;
  public failingPaths = new Set<string>();
  public putDelayMs = 0;
  public readonly signals: (AbortSignal | undefined)[] = [];

  constructor(private readonly clock: VirtualClock) {}

  public async preload(
    requests: ReadonlyArray<SENDPreloadRequest>,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<SENDPreloadResponse>> {
    await Promise.resolve();
    this.signals.push(signal);
    this.preloads.push(requests);
    if (this.preloadFailure !== undefined) throw this.preloadFailure;
    return requests.map((request) => ({
      preloadIdx: request.preloadIdx,
      key: `PN_NOTIFICATION_ATTACHMENTS-${request.sha256.slice(0, 8)}.pdf`,
      url: 'https://s3.example/presigned',
      secret: 's',
      httpMethod: 'PUT',
    }));
  }

  public async upload(
    preload: SENDPreloadResponse,
    filePath: string,
    _sha256: string,
    _contentType: string,
    signal?: AbortSignal,
  ): Promise<string> {
    this.signals.push(signal);
    if (this.putDelayMs > 0) await this.clock.sleep(this.putDelayMs);
    this.puts.push(filePath);
    if (this.failingPaths.has(filePath)) throw httpError(500);
    return `version-${preload.key}`;
  }
}

function inspected(index: number): InspectedDocument {
  const sha256 = createHash('sha256').update(String(index)).digest('base64');
  return { path: `/docs/file-${index}.pdf`, size: 10, sha256, contentType: 'application/pdf' };
}

function setup(batchSize = 15): { clock: VirtualClock; gateway: FakeGateway; stage: UploadStage; sink: MemorySink } {
  const clock = new VirtualClock();
  const gateway = new FakeGateway(clock);
  const sink = new MemorySink();
  const limiter = new GORateLimiter({ ratePerSecond: 20, priorities: 2, sleeper: clock, now: () => clock.now() });
  const stage = new UploadStage({ gateway, limiter, ledger: new RowLedger(sink), clock, batchSize });
  return { clock, gateway, stage, sink };
}

describe('UploadStage', () => {
  it('uploads 1000 rows of 100 distinct files with 100 PUTs and 7 preloads', async () => {
    const { clock, gateway, stage, sink } = setup();
    const uploads = Array.from({ length: 1000 }, async (_, row) => stage.upload(inspected(row % 100)));
    const files = await clock.run(Promise.all(uploads));
    assert.equal(files.length, 1000);
    assert.equal(gateway.puts.length, 100);
    assert.equal(gateway.preloads.length, 7);
    assert.ok(gateway.preloads.every((batch) => batch.length <= 15));
    assert.equal(sink.events('DOCUMENT_UPLOADED').length, 100);
    assert.equal(files[0]?.versionToken, `version-${files[0]?.key}`);
  });

  it('fails only the rows using a file whose upload failed', async () => {
    const { clock, gateway, stage } = setup();
    gateway.failingPaths.add('/docs/file-1.pdf');
    const results = await clock.run(
      Promise.allSettled([stage.upload(inspected(0)), stage.upload(inspected(1)), stage.upload(inspected(1))]),
    );
    assert.equal(results[0]?.status, 'fulfilled');
    assert.equal(results[1]?.status, 'rejected');
    assert.equal(results[2]?.status, 'rejected');
    const reason = results[1]?.status === 'rejected' ? (results[1].reason as UploadError) : undefined;
    assert.equal(reason?.code, 'UPLOAD_FAILED');
    assert.equal(gateway.puts.filter((p) => p === '/docs/file-1.pdf').length, 3, 'PUT retried 3 times');
  });

  it('retries a content whose previous upload failed, instead of reusing the failure', async () => {
    const { clock, gateway, stage } = setup();
    gateway.failingPaths.add('/docs/file-1.pdf');
    await assert.rejects(clock.run(stage.upload(inspected(1))), UploadError);
    gateway.failingPaths.clear(); // the outage is over
    const file = await clock.run(stage.upload(inspected(1)));
    assert.equal(file.versionToken, `version-${file.key}`);
    assert.equal(gateway.puts.length, 4, '3 failed attempts, then 1 new upload');
  });

  it('rejects the batch with UPLOAD_REJECTED on a preload 4xx', async () => {
    const { clock, gateway, stage } = setup();
    gateway.preloadFailure = httpError(400);
    await assert.rejects(clock.run(stage.upload(inspected(0))), (error: unknown) => {
      return error instanceof UploadError && error.code === 'UPLOAD_REJECTED';
    });
    assert.equal(gateway.preloads.length, 1, 'no retry on 4xx');
  });

  it('preloads again a file whose PUT starts after the presigned URL expiry', async () => {
    const clock = new VirtualClock();
    const gateway = new FakeGateway(clock);
    gateway.putDelayMs = 20 * 60_000; // each PUT holds its slot for 20 minutes
    const limiter = new GORateLimiter({ ratePerSecond: 20, sleeper: clock, now: () => clock.now() });
    const stage = new UploadStage({
      gateway,
      limiter,
      ledger: new RowLedger(undefined),
      clock,
      uploadConcurrency: 1,
      batchSize: 2,
    });
    await clock.run(Promise.all([stage.upload(inspected(0)), stage.upload(inspected(1))]));
    assert.equal(gateway.preloads.length, 2, 'second file preloaded again');
    assert.equal(gateway.puts.length, 2);
  });

  it('reuses recent uploads of a previous session', async () => {
    const clock = new VirtualClock();
    const gateway = new FakeGateway(clock);
    const limiter = new GORateLimiter({ ratePerSecond: 20, sleeper: clock, now: () => clock.now() });
    const doc = inspected(5);
    const stage = new UploadStage({
      gateway,
      limiter,
      ledger: new RowLedger(undefined),
      clock,
      previousUploads: [
        {
          sha256: doc.sha256,
          key: 'OLD',
          versionToken: 'v',
          contentType: 'application/pdf',
          ts: new Date(clock.now() - 3_600_000).toISOString(),
        },
        {
          sha256: inspected(6).sha256,
          key: 'STALE',
          versionToken: 'v',
          contentType: 'application/pdf',
          ts: '2026-10-01T00:00:00.000Z',
        },
      ],
    });
    const [recent, stale] = await clock.run(Promise.all([stage.upload(doc), stage.upload(inspected(6))]));
    assert.equal(recent?.key, 'OLD');
    assert.notEqual(stale?.key, 'STALE');
    assert.equal(gateway.puts.length, 1);
  });
});

describe('UploadStage (resume, journal, stop)', () => {
  it('never reuses a previous upload whose timestamp cannot be parsed', async () => {
    const clock = new VirtualClock();
    const gateway = new FakeGateway(clock);
    const limiter = new GORateLimiter({ ratePerSecond: 20, sleeper: clock, now: () => clock.monotonic() });
    const doc = inspected(7);
    const stage = new UploadStage({
      gateway,
      limiter,
      ledger: new RowLedger(undefined),
      clock,
      previousUploads: [
        { sha256: doc.sha256, key: 'GARBLED', versionToken: 'v', contentType: 'application/pdf', ts: 'not-a-date' },
      ],
    });
    const file = await clock.run(stage.upload(doc));
    assert.notEqual(file.key, 'GARBLED');
    assert.equal(gateway.puts.length, 1);
  });

  it('rejects with the journal error, not UPLOAD_FAILED, when the upload cannot be journaled', async () => {
    const clock = new VirtualClock();
    const gateway = new FakeGateway(clock);
    const limiter = new GORateLimiter({ ratePerSecond: 20, sleeper: clock, now: () => clock.monotonic() });
    const brokenJournal = {
      append: async (): Promise<void> => {
        await Promise.resolve();
        throw new Error('journal write failed');
      },
    };
    const stage = new UploadStage({ gateway, limiter, ledger: new RowLedger(brokenJournal), clock });
    await assert.rejects(clock.run(stage.upload(inspected(0))), (error: unknown) => {
      return !(error instanceof UploadError) && error instanceof Error && /journal write failed/.test(error.message);
    });
    assert.equal(gateway.puts.length, 1, 'the PUT succeeded once and is not retried');
  });

  it('passes the stop signal to preload and PUT', async () => {
    const clock = new VirtualClock();
    const gateway = new FakeGateway(clock);
    const limiter = new GORateLimiter({ ratePerSecond: 20, sleeper: clock, now: () => clock.monotonic() });
    const controller = new AbortController();
    const stage = new UploadStage({
      gateway,
      limiter,
      ledger: new RowLedger(undefined),
      clock,
      signal: controller.signal,
    });
    await clock.run(stage.upload(inspected(0)));
    assert.deepEqual(gateway.signals, [controller.signal, controller.signal]);
  });
});

describe('LocalDocumentInspector', () => {
  it('checks extension, existence, magic number and hashes the content', async () => {
    const dir = tempDir('dispatch-docs');
    const pdf = path.join(dir, 'atto.pdf');
    const fake = path.join(dir, 'fake.pdf');
    const json = path.join(dir, 'meta.json');
    await writeFixture(pdf, '%PDF-1.7 test');
    await writeFixture(fake, 'hello');
    await writeFixture(json, '{}');
    const inspector = new LocalDocumentInspector(os.tmpdir());

    const ok = await inspector.inspect(pdf);
    assert.ok(!isInspectionFailure(ok));
    assert.equal(ok.sha256, createHash('sha256').update('%PDF-1.7 test').digest('base64'));

    const failures = await Promise.all(
      [fake, json, path.join(dir, 'missing.pdf')].map(async (file) => inspector.inspect(file)),
    );
    assert.deepEqual(
      failures.map((failure) => (isInspectionFailure(failure) ? failure.failure : 'ok')),
      ['NOT_A_PDF', 'UNSUPPORTED_EXTENSION', 'FILE_NOT_FOUND'],
    );
    assert.equal(MAX_DOCUMENT_BYTES, 209_715_200);
  });

  it('confines row files to the documents directory; not the shared document', async () => {
    const dir = tempDir('dispatch-confined');
    const documentsDir = path.join(dir, 'documents');
    const outside = path.join(dir, 'outside.pdf');
    await writeFixture(path.join(documentsDir, 'atto.pdf'), '%PDF-1.7 in');
    await writeFixture(outside, '%PDF-1.7 out');
    // Symlinks escaping the directory are covered by the go-common confineTo tests.
    const escaping = path.join(documentsDir, '..', 'outside.pdf');
    const inspector = new LocalDocumentInspector(documentsDir);

    assert.ok(!isInspectionFailure(await inspector.inspectRowFile(path.join(documentsDir, 'atto.pdf'))));
    const escaped = await inspector.inspectRowFile(escaping);
    assert.equal(isInspectionFailure(escaped) ? escaped.failure : 'ok', 'DOCUMENT_OUTSIDE_DIR');
    assert.ok(!isInspectionFailure(await inspector.inspect(outside)), 'the shared document is not confined');
  });
});

describe('DocumentResolver', () => {
  it('uses the shared reference as is and placeholders in a dry run', async () => {
    const dir = tempDir('dispatch-shared');
    const pdf = path.join(dir, 'atto.pdf');
    await writeFixture(pdf, '%PDF-1.4');
    const inspector = new LocalDocumentInspector(os.tmpdir());

    const reference = await DocumentResolver.prepareShared({
      config: { reference: { key: 'K', versionToken: 'v1', sha256: 'S' }, title: 'Atto' },
      inspector,
      placeholders: false,
    });
    assert.deepEqual(reference, [
      { key: 'K', versionToken: 'v1', sha256: 'S', contentType: 'application/pdf', title: 'Atto' },
    ]);

    const placeholder = await DocumentResolver.prepareShared({
      config: { files: [pdf] },
      inspector,
      placeholders: true,
    });
    assert.match(placeholder[0]?.key ?? '', /^<upload:/);
    assert.equal(placeholder[0]?.title, 'atto');

    // Outside a dry run, a file without an upload stage never becomes a placeholder.
    await assert.rejects(
      DocumentResolver.prepareShared({ config: { files: [pdf] }, inspector, placeholders: false }),
      /SafeStorage gateway is not configured/,
    );

    await assert.rejects(
      DocumentResolver.prepareShared({
        config: { files: [path.join(dir, 'missing.pdf')] },
        inspector,
        placeholders: true,
      }),
      /file not found/,
    );

    const resolver = new DocumentResolver({ inspector, shared: reference, placeholders: false });
    assert.deepEqual(await resolver.resolve({ kind: 'shared' }), reference);
  });

  it('rejects a pratica without attachments with a non-retryable error', async () => {
    const resolver = new DocumentResolver({
      inspector: new LocalDocumentInspector(os.tmpdir()),
      placeholders: false,
      attachmentsByPratica: new Map([['P-EMPTY', []]]),
    });
    for (const [pratica, code] of [
      ['P-EMPTY', 'PRATICA_EMPTY'],
      ['P-UNKNOWN', 'PRATICA_UNKNOWN'],
    ] as const) {
      const error = await resolver.resolve({ kind: 'pratica', pratica }).then(
        () => undefined,
        (rejection: unknown) => rejection,
      );
      assert.ok(error instanceof DispatchError, `${pratica} rejects`);
      assert.equal(error.code, code);
      assert.equal(toDocumentFailure(error)?.rowError.retryable, false);
    }
  });
});
