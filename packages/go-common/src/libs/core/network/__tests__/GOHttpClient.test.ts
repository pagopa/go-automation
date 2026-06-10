import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { GOHttpClient } from '../GOHttpClient.js';
import { GOHttpClientError } from '../GOHttpClientError.js';

function stubFetch(response: Response): void {
  mock.method(globalThis, 'fetch', async (): Promise<Response> => {
    await Promise.resolve();
    return response;
  });
}

function createClient(): GOHttpClient {
  return new GOHttpClient({ baseUrl: 'https://api.example.com', timeout: 5000 });
}

describe('GOHttpClient', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('parses application/json responses', async () => {
    stubFetch(new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await createClient().get<{ ok: boolean }>('/path');
    assert.deepStrictEqual(result, { ok: true });
  });

  it('parses JSON responses with content type parameters', async () => {
    stubFetch(
      new Response('[{"key":"k1"}]', { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }),
    );

    const result = await createClient().get<{ key: string }[]>('/path');
    assert.deepStrictEqual(result, [{ key: 'k1' }]);
  });

  it('parses +json media types (e.g. application/problem+json)', async () => {
    stubFetch(
      new Response('{"status":400,"title":"Bad Request"}', {
        status: 400,
        headers: { 'content-type': 'application/problem+json' },
      }),
    );

    await assert.rejects(createClient().get('/path'), (error: unknown) => {
      assert.ok(error instanceof GOHttpClientError);
      assert.deepStrictEqual(error.response, { status: 400, title: 'Bad Request' });
      return true;
    });
  });

  it('returns non-JSON responses as text', async () => {
    stubFetch(new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));

    const result = await createClient().get<string>('/path');
    assert.strictEqual(result, '<html></html>');
  });

  it('put resolves with the response headers (lowercase names)', async () => {
    stubFetch(new Response(null, { status: 200, headers: { 'X-Amz-Version-Id': 's3-version-7', ETag: '"abc"' } }));

    const headers = await createClient().put('https://s3.example/presigned', Buffer.from('data'));
    assert.strictEqual(headers['x-amz-version-id'], 's3-version-7');
    assert.strictEqual(headers['etag'], '"abc"');
  });

  it('put rejects with GOHttpClientError on non-2xx responses', async () => {
    stubFetch(new Response('denied', { status: 403, statusText: 'Forbidden' }));

    await assert.rejects(createClient().put('https://s3.example/presigned', Buffer.from('data')), /HTTP 403/);
  });
});
