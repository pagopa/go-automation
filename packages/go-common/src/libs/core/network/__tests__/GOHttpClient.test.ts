import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { GOHttpClient } from '../GOHttpClient.js';
import { GOHttpClientError } from '../GOHttpClientError.js';
import type { GOHttpRetryPolicy } from '../GOHttpRequestOptions.js';

function stubFetch(response: Response): void {
  mock.method(globalThis, 'fetch', async (): Promise<Response> => {
    await Promise.resolve();
    return response;
  });
}

function createClient(): GOHttpClient {
  return new GOHttpClient({ baseUrl: 'https://api.example.com', timeout: 5000 });
}

function retryPolicy(idempotencyKey: string = 'callback-key'): GOHttpRetryPolicy {
  return {
    enabled: true,
    idempotencyKey,
    maxAttempts: 3,
    retryableStatuses: [408, 429, 500, 502, 503, 504],
    respectRetryAfter: true,
    maxRetryAfterMs: 15_000,
  };
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

  it('executes generic absolute requests without a baseUrl', async () => {
    mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const requestUrl = url instanceof Request ? url.url : url instanceof URL ? url.href : url;
      assert.strictEqual(requestUrl, 'https://external.example/status');
      assert.strictEqual(init?.method, 'GET');
      return await Promise.resolve(
        new Response('{"ok":true}', {
          status: 202,
          statusText: 'Accepted',
          headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
        }),
      );
    });

    const result = await new GOHttpClient({}).request<{ ok: boolean }>('GET', 'https://external.example/status');

    assert.deepStrictEqual(result, {
      data: { ok: true },
      statusCode: 202,
      statusText: 'Accepted',
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
      attemptsUsed: 1,
    });
  });

  it('materializes JSON bodies with a default content type for generic requests', async () => {
    mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      assert.strictEqual(init?.method, 'DELETE');
      assert.strictEqual(new Headers(init?.headers).get('content-type'), 'application/json');
      assert.strictEqual(init?.body, '{"id":"alarm-1"}');
      return await Promise.resolve(
        new Response('{"deleted":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    });

    const result = await createClient().request<{ deleted: boolean }>('delete', '/alarms/alarm-1', { id: 'alarm-1' });

    assert.deepStrictEqual(result, {
      data: { deleted: true },
      statusCode: 200,
      statusText: '',
      headers: { 'content-type': 'application/json' },
      attemptsUsed: 1,
    });
  });

  it('does not retry a 503 when retryPolicy is absent', async () => {
    let calls = 0;
    mock.method(globalThis, 'fetch', async (): Promise<Response> => {
      calls += 1;
      return await Promise.resolve(new Response('unavailable', { status: 503 }));
    });

    await assert.rejects(createClient().get('/path'), /HTTP 503/);
    assert.strictEqual(calls, 1);
  });

  it('retries PATCH with one materialized body and one idempotency key', async () => {
    const bodies: string[] = [];
    const keys: string[] = [];
    let calls = 0;
    mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls += 1;
      const body = init?.body;
      if (typeof body !== 'string') throw new Error('Expected a materialized string request body');
      bodies.push(body);
      keys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
      return await Promise.resolve(
        calls === 1
          ? new Response('retry', { status: 503, headers: { 'Retry-After': '0' } })
          : new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    });

    const result = await createClient().patchWithMetadata<{ ok: boolean }>(
      '/lifecycle',
      { attemptId: 'attempt-1' },
      undefined,
      { retryPolicy: retryPolicy() },
    );

    assert.deepStrictEqual(result, {
      data: { ok: true },
      statusCode: 200,
      statusText: '',
      headers: { 'content-type': 'application/json' },
      attemptsUsed: 2,
    });
    assert.deepStrictEqual(bodies, ['{"attemptId":"attempt-1"}', '{"attemptId":"attempt-1"}']);
    assert.deepStrictEqual(keys, ['callback-key', 'callback-key']);
  });

  it('never retries 401 and reports the consumed attempt', async () => {
    let calls = 0;
    mock.method(globalThis, 'fetch', async (): Promise<Response> => {
      calls += 1;
      return await Promise.resolve(new Response('unauthorized', { status: 401 }));
    });

    await assert.rejects(
      createClient().postWithMetadata('/callback', {}, undefined, { retryPolicy: retryPolicy() }),
      (error: unknown) => {
        assert.ok(error instanceof GOHttpClientError);
        assert.strictEqual(error.attemptsUsed, 1);
        return true;
      },
    );
    assert.strictEqual(calls, 1);
  });

  it('stops before Retry-After when the remaining deadline is insufficient', async () => {
    let calls = 0;
    mock.method(globalThis, 'fetch', async (): Promise<Response> => {
      calls += 1;
      return await Promise.resolve(new Response('rate limited', { status: 429, headers: { 'Retry-After': '120' } }));
    });

    await assert.rejects(
      createClient().post('/callback', {}, undefined, {
        retryPolicy: retryPolicy(),
        deadlineAtMs: Date.now() + 50,
      }),
      /HTTP 429/,
    );
    assert.strictEqual(calls, 1);
  });

  it('propagates attemptsUsed after three retryable responses', async () => {
    let calls = 0;
    mock.method(globalThis, 'fetch', async (): Promise<Response> => {
      calls += 1;
      return await Promise.resolve(new Response('unavailable', { status: 503, headers: { 'Retry-After': '0' } }));
    });

    await assert.rejects(
      createClient().postWithMetadata('/callback', {}, undefined, { retryPolicy: retryPolicy() }),
      (error: unknown) => {
        assert.ok(error instanceof GOHttpClientError);
        assert.strictEqual(error.attemptsUsed, 3);
        return true;
      },
    );
    assert.strictEqual(calls, 3);
  });

  it('rejects non-replayable bodies and Content-Length before network access', async () => {
    let calls = 0;
    mock.method(globalThis, 'fetch', async (): Promise<Response> => {
      calls += 1;
      return await Promise.resolve(new Response(null, { status: 200 }));
    });

    await assert.rejects(
      createClient().post('/callback', new ReadableStream(), undefined, { retryPolicy: retryPolicy() }),
      /replayable/,
    );
    await assert.rejects(createClient().post('/callback', {}, { 'Content-Length': '2' }), /Content-Length/);
    assert.strictEqual(calls, 0);
  });

  it('redacts sensitive request, response and idempotency fields before events', async () => {
    stubFetch(
      new Response('{"accessToken":"server-token","ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'refresh=secret' },
      }),
    );
    const client = createClient();
    const events: unknown[] = [];
    client.on('http:request:started', (event) => {
      events.push(event);
    });
    client.on('http:response:received', (event) => {
      events.push(event);
    });

    await client.post(
      '/callback',
      { password: 'plain-secret', safe: 'visible' },
      { Authorization: 'Bearer secret' },
      { retryPolicy: retryPolicy('secret-key') },
    );

    const serialized = JSON.stringify(events);
    assert.doesNotMatch(serialized, /plain-secret|Bearer secret|server-token|refresh=secret|secret-key/);
    assert.match(serialized, /\[REDACTED\]/);
    assert.match(serialized, /visible/);
  });
});
