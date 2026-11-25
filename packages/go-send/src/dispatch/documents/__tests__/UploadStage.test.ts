import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import * as path from 'node:path';

import { GORateLimiter } from '@pagopa/go-common/concurrency';

import type { SENDPreloadRequest } from '../../../services/attachment/models/SENDPreloadRequest.js';
import type { SENDPreloadResponse } from '../../../services/attachment/models/SENDPreloadResponse.js';
import { httpError } from '../../__tests__/helpers/FakeB2BApi.js';
import { MemorySink } from '../../__tests__/helpers/MemorySink.js';
import { tempDir, writeFixture } from '../../__tests__/helpers/testFiles.js';
import { VirtualClock } from '../../__tests__/helpers/VirtualClock.js';
import type { RecordedUpload } from '../../journal/RecordedUpload.js';
import { RowLedger } from '../../journal/RowLedger.js';
import { DispatchError } from '../../DispatchError.js';
import { DocumentResolver } from '../DocumentResolver.js';
import { toDocumentFailure } from '../toDocumentFailure.js';
import type { InspectedDocument } from '../InspectedDocument.js';
import { isInspectionFailure } from '../isInspectionFailure.js';
import { LocalDocumentInspector } from '../LocalDocumentInspector.js';
import type { SafeStorageGateway } from '../SafeStorageGateway.js';
import { UploadError } from '../UploadError.js';
import { UploadStage } from '../UploadStage.js';
import type { UploadStageOptions } from '../UploadStageOptions.js';

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

interface UploadHarness {
  readonly clock: VirtualClock;
  readonly gateway: FakeGateway;
  readonly stage: UploadStage;
  readonly sink: MemorySink;
}

function setup(overrides: Partial<UploadStageOptions> = {}): UploadHarness {
  const clock = new VirtualClock();
  const gateway = new FakeGateway(clock);
  const sink = new MemorySink();
  const limiter = new GORateLimiter({ ratePerSecond: 20, sleeper: clock, now: () => clock.monotonic() });
  const stage = new UploadStage({ gateway, limiter, ledger: new RowLedger(sink), clock, ...overrides });
  return { clock, gateway, stage, sink };
}

/** A previous-session upload of `doc` journaled at `ts`. */
function previousUpload(doc: InspectedDocument, key: string, ts: string): RecordedUpload {
  return { sha256: doc.sha256, key, versionToken: 'v', contentType: 'application/pdf', ts };
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
    assert.deepEqual(
      results.map((result) => result.status),
      ['fulfilled', 'rejected', 'rejected'],
    );
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
    const { clock, gateway, stage } = setup({ uploadConcurrency: 1, batchSize: 2 });
    gateway.putDelayMs = 20 * 60_000; // each PUT holds its slot for 20 minutes
    await clock.run(Promise.all([stage.upload(inspected(0)), stage.upload(inspected(1))]));
    assert.equal(gateway.preloads.length, 2, 'second file preloaded again');
    assert.equal(gateway.puts.length, 2);
  });

  it('reuses recent uploads of a previous session, never stale or undated ones', async () => {
    const [recent, stale, garbled] = [inspected(5), inspected(6), inspected(7)];
    const { clock, gateway, stage } = setup({
      previousUploads: [
        previousUpload(recent, 'OLD', new Date(new VirtualClock().now() - 3_600_000).toISOString()),
        previousUpload(stale, 'STALE', '2026-10-01T00:00:00.000Z'),
        previousUpload(garbled, 'GARBLED', 'not-a-date'),
      ],
    });
    const files = await clock.run(Promise.all([stage.upload(recent), stage.upload(stale), stage.upload(garbled)]));
    assert.equal(files[0]?.key, 'OLD');
    assert.notEqual(files[1]?.key, 'STALE');
    assert.notEqual(files[2]?.key, 'GARBLED');
    assert.equal(gateway.puts.length, 2);
  });

  it('rejects with the journal error, not UPLOAD_FAILED, when the upload cannot be journaled', async () => {
    const brokenJournal = {
      append: async (): Promise<void> => {
        await Promise.resolve();
        throw new Error('journal write failed');
      },
    };
    const { clock, gateway, stage } = setup({ ledger: new RowLedger(brokenJournal) });
    await assert.rejects(clock.run(stage.upload(inspected(0))), (error: unknown) => {
      return !(error instanceof UploadError) && error instanceof Error && /journal write failed/.test(error.message);
    });
    assert.equal(gateway.puts.length, 1, 'the PUT succeeded once and is not retried');
  });

  it('passes the stop signal to preload and PUT', async () => {
    const controller = new AbortController();
    const { clock, gateway, stage } = setup({ signal: controller.signal });
    await clock.run(stage.upload(inspected(0)));
    assert.deepEqual(gateway.signals, [controller.signal, controller.signal]);
  });
});

describe('LocalDocumentInspector', () => {
  it('checks extension, existence, magic number and hashes the content', async () => {
    const dir = await tempDir('dispatch-docs');
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
  });

  it('streams a PDF larger than one read chunk: same size and hash as the whole content', async () => {
    const dir = await tempDir('dispatch-docs-large');
    const pdf = path.join(dir, 'big.pdf');
    const content = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(300 * 1024, 7)]);
    await writeFixture(pdf, content);

    const inspected = await new LocalDocumentInspector(os.tmpdir()).inspect(pdf);

    assert.ok(!isInspectionFailure(inspected));
    assert.equal(inspected.size, content.length);
    assert.equal(inspected.sha256, createHash('sha256').update(content).digest('base64'));
  });

  it('reports an empty file and a file shorter than the PDF header', async () => {
    const dir = await tempDir('dispatch-docs-short');
    const empty = path.join(dir, 'empty.pdf');
    const short = path.join(dir, 'short.pdf');
    await writeFixture(empty, '');
    await writeFixture(short, '%PD');
    const inspector = new LocalDocumentInspector(os.tmpdir());

    const results = await Promise.all([inspector.inspect(empty), inspector.inspect(short)]);

    assert.deepEqual(
      results.map((result) => (isInspectionFailure(result) ? result.failure : 'ok')),
      ['FILE_EMPTY', 'NOT_A_PDF'],
    );
  });

  it('confines row files to the documents directory; not the shared document', async () => {
    const dir = await tempDir('dispatch-confined');
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
    const dir = await tempDir('dispatch-shared');
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
