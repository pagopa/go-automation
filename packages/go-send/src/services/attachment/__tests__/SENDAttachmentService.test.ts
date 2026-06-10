import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';

import type { GOHttpClient } from '@go-automation/go-common/core';
import { SENDAttachmentService } from '../SENDAttachmentService.js';
import type { SENDPreloadRequest } from '../models/SENDPreloadRequest.js';
import type { SENDPreloadResponse } from '../models/SENDPreloadResponse.js';

interface RecordedPut {
  readonly url: string;
  readonly buffer: Buffer;
  readonly headers: Record<string, string> | undefined;
}

interface FakeHttpClient {
  readonly client: GOHttpClient;
  readonly preloadBodies: SENDPreloadRequest[][];
  readonly puts: RecordedPut[];
}

function createFakeHttpClient(
  preloadResponse: Partial<SENDPreloadResponse> = {},
  putResponseHeaders: Record<string, string> = {},
): FakeHttpClient {
  const preloadBodies: SENDPreloadRequest[][] = [];
  const puts: RecordedPut[] = [];

  const response: SENDPreloadResponse = {
    key: 'safe-storage-key',
    versionToken: 'token-1',
    url: 'https://s3.example/presigned',
    secret: 'secret-1',
    httpMethod: 'PUT',
    ...preloadResponse,
  };

  const post = mock.fn(async (_path: string, body: unknown): Promise<SENDPreloadResponse[]> => {
    await Promise.resolve();
    preloadBodies.push(body as SENDPreloadRequest[]);
    return [response];
  });
  const put = mock.fn(
    async (url: string, buffer: Buffer, headers?: Record<string, string>): Promise<Record<string, string>> => {
      await Promise.resolve();
      puts.push({ url, buffer, headers });
      return putResponseHeaders;
    },
  );

  return {
    client: { post, put } as unknown as GOHttpClient,
    preloadBodies,
    puts,
  };
}

function sha256Base64(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('base64');
}

describe('SENDAttachmentService', () => {
  it('upload sends the explicit content type to preload and presigned PUT', async () => {
    const fake = createFakeHttpClient();
    const service = new SENDAttachmentService(fake.client);
    const buffer = Buffer.from('{"a":1}');

    const result = await service.upload(buffer, 'application/json');

    assert.strictEqual(fake.preloadBodies.length, 1);
    assert.strictEqual(fake.preloadBodies[0]![0]!.contentType, 'application/json');
    assert.strictEqual(fake.preloadBodies[0]![0]!.sha256, sha256Base64(buffer));

    assert.strictEqual(fake.puts.length, 1);
    const put = fake.puts[0]!;
    assert.strictEqual(put.url, 'https://s3.example/presigned');
    assert.strictEqual(put.headers?.['Content-Type'], 'application/json');
    assert.strictEqual(put.headers?.['x-amz-checksum-sha256'], sha256Base64(buffer));
    assert.strictEqual(put.headers?.['x-amz-meta-secret'], 'secret-1');
    // Content-Length must NOT be set manually: forbidden fetch header,
    // undici computes it from the buffer body
    assert.strictEqual(put.headers?.['Content-Length'], undefined);

    assert.strictEqual(result.ref.key, 'safe-storage-key');
    assert.strictEqual(result.ref.versionToken, 'token-1');
    assert.strictEqual(result.digests.sha256, sha256Base64(buffer));
  });

  it('upload defaults to application/pdf', async () => {
    const fake = createFakeHttpClient();
    const service = new SENDAttachmentService(fake.client);

    await service.upload(Buffer.from('%PDF-1.7'));

    assert.strictEqual(fake.preloadBodies[0]![0]!.contentType, 'application/pdf');
    assert.strictEqual(fake.puts[0]!.headers?.['Content-Type'], 'application/pdf');
  });

  it('upload uses the x-amz-version-id response header as versionToken', async () => {
    const fake = createFakeHttpClient({}, { 'x-amz-version-id': 's3-version-42' });
    const service = new SENDAttachmentService(fake.client);

    const result = await service.upload(Buffer.from('content'));

    assert.strictEqual(result.ref.versionToken, 's3-version-42');
  });

  it('upload falls back to versionToken v1 when preload and upload omit it', async () => {
    const fake = createFakeHttpClient({ versionToken: '' });
    const service = new SENDAttachmentService(fake.client);

    const result = await service.upload(Buffer.from('content'));

    assert.strictEqual(result.ref.versionToken, 'v1');
  });

  it('upload accepts a preload body returned as a raw JSON string (non-JSON content type)', async () => {
    const body = JSON.stringify([
      {
        preloadIdx: '0',
        key: 'safe-storage-key',
        secret: 'secret-1',
        httpMethod: 'PUT',
        url: 'https://s3.example/presigned',
      },
    ]);
    const post = mock.fn(async (): Promise<unknown> => {
      await Promise.resolve();
      return body;
    });
    const put = mock.fn(async (): Promise<Record<string, string>> => {
      await Promise.resolve();
      return { 'x-amz-version-id': 's3-version-9' };
    });
    const service = new SENDAttachmentService({ post, put } as unknown as GOHttpClient);

    const result = await service.upload(Buffer.from('content'));

    assert.strictEqual(result.ref.key, 'safe-storage-key');
    assert.strictEqual(result.ref.versionToken, 's3-version-9');
  });

  it('upload rejects with a descriptive error when the preload response is not a JSON array', async () => {
    const post = mock.fn(async (): Promise<unknown> => {
      await Promise.resolve();
      return 'Service temporarily unavailable, "secret":"leak-me" included';
    });
    const service = new SENDAttachmentService({ post } as unknown as GOHttpClient);

    await assert.rejects(service.upload(Buffer.from('x')), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Unexpected preload response from SafeStorage \(expected a JSON array\)/);
      assert.match(error.message, /\[REDACTED\]/, 'secret values must be redacted in raw dumps');
      assert.doesNotMatch(error.message, /leak-me/, 'secret value must not leak');
      return true;
    });
  });

  it('upload rejects clearly when SafeStorage requests a POST upload', async () => {
    const fake = createFakeHttpClient({ httpMethod: 'POST' });
    const service = new SENDAttachmentService(fake.client);

    await assert.rejects(service.upload(Buffer.from('x')), /HTTP POST upload, which is not supported/);
  });

  it('uploadPDF keeps the legacy application/pdf behavior', async () => {
    const fake = createFakeHttpClient();
    const service = new SENDAttachmentService(fake.client);
    const buffer = Buffer.from('%PDF-1.7 legacy');

    const result = await service.uploadPDF(buffer);

    assert.strictEqual(fake.preloadBodies[0]![0]!.contentType, 'application/pdf');
    assert.strictEqual(fake.puts[0]!.headers?.['Content-Type'], 'application/pdf');
    assert.strictEqual(result.digests.sha256, sha256Base64(buffer));
    assert.strictEqual(result.buffer, buffer);
  });

  it('uploadJSON keeps the legacy application/json behavior', async () => {
    const fake = createFakeHttpClient();
    const service = new SENDAttachmentService(fake.client);
    const data = { operationType: 'F24', amount: 100 };
    const expectedBuffer = Buffer.from(JSON.stringify(data), 'utf-8');

    const result = await service.uploadJSON(data);

    assert.strictEqual(fake.preloadBodies[0]![0]!.contentType, 'application/json');
    assert.strictEqual(fake.puts[0]!.headers?.['Content-Type'], 'application/json');
    assert.strictEqual(fake.puts[0]!.buffer.length, expectedBuffer.length);
    assert.strictEqual(result.digests.sha256, sha256Base64(expectedBuffer));
  });

  it('upload rejects on empty preload response', async () => {
    const post = mock.fn(async (): Promise<SENDPreloadResponse[]> => {
      await Promise.resolve();
      return [];
    });
    const service = new SENDAttachmentService({ post } as unknown as GOHttpClient);

    await assert.rejects(service.upload(Buffer.from('x')), /Empty preload response/);
  });

  it('upload rejects with a descriptive error when the preload response lacks the presigned url', async () => {
    const post = mock.fn(async (): Promise<unknown[]> => {
      await Promise.resolve();
      return [{ preloadIdx: '0', key: 'some-key', secret: 's3cret', httpMethod: 'PUT' }];
    });
    const service = new SENDAttachmentService({ post } as unknown as GOHttpClient);

    await assert.rejects(service.upload(Buffer.from('x')), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Invalid preload response from SafeStorage \(missing or empty: url\)/);
      assert.match(error.message, /"key":"some-key"/, 'message must include the response body for diagnosis');
      assert.match(error.message, /\[REDACTED\]/, 'secret must be redacted');
      assert.doesNotMatch(error.message, /s3cret/, 'secret value must not leak');
      return true;
    });
  });
});
