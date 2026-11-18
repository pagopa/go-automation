import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import {
  COMPLETE_EXECUTION_BODY,
  EXECUTION_ID,
  requestUrl,
  serviceClient,
  serviceLoginResponse,
  WATCHTOWER_BASE_URL,
} from './watchtowerTestDoubles.js';

afterEach(() => mock.restoreAll());

const LIFECYCLE_OPTIONS = { idempotencyKey: 'complete:execution:attempt' } as const;

describe('WatchtowerClient', () => {
  it('normalizes an API suffix followed by many trailing slashes', async () => {
    let requestedUrl: string | undefined;
    mock.method(globalThis, 'fetch', async (input: string | URL | Request): Promise<Response> => {
      requestedUrl = requestUrl(input);
      return await Promise.resolve(serviceLoginResponse());
    });
    const client = serviceClient(`${WATCHTOWER_BASE_URL}/api${'/'.repeat(10_000)}`);

    await client.login();

    assert.strictEqual(requestedUrl, `${WATCHTOWER_BASE_URL}/auth/service/login`);
  });

  it('retries an idempotent lifecycle callback with the same body and key', async () => {
    const bodies: string[] = [];
    const keys: string[] = [];
    let calls = 0;
    mock.method(globalThis, 'fetch', async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls += 1;
      if (calls === 1) return await Promise.resolve(serviceLoginResponse());
      const body = init?.body;
      if (typeof body !== 'string') throw new Error('Expected a materialized lifecycle body');
      bodies.push(body);
      keys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
      // Retry-After: 0 keeps the retry immediate instead of waiting for the backoff.
      if (calls === 2) return new Response('unavailable', { status: 503, headers: { 'retry-after': '0' } });
      return await Promise.resolve(Response.json({ status: 'SKIPPED', outcome: 'CAPABILITY_WITHDRAWN' }));
    });

    const result = await serviceClient().completeExecution(EXECUTION_ID, COMPLETE_EXECUTION_BODY, {
      ...LIFECYCLE_OPTIONS,
      deadlineAtMs: Date.now() + 5_000,
    });

    assert.deepStrictEqual(result, { status: 'SKIPPED', outcome: 'CAPABILITY_WITHDRAWN' });
    assert.deepStrictEqual(bodies, [bodies[0], bodies[0]]);
    assert.deepStrictEqual(keys, [LIFECYCLE_OPTIONS.idempotencyKey, LIFECYCLE_OPTIONS.idempotencyKey]);
  });

  it('returns a typed 409 control response without retrying it', async () => {
    let lifecycleCalls = 0;
    mock.method(globalThis, 'fetch', async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (!new Headers(init?.headers).has('authorization')) return await Promise.resolve(serviceLoginResponse());
      lifecycleCalls += 1;
      return await Promise.resolve(
        Response.json(
          { conflict: 'IDEMPOTENCY_PAYLOAD_MISMATCH', status: 'SUCCEEDED' },
          { status: 409, statusText: 'Conflict' },
        ),
      );
    });

    const result = await serviceClient().completeExecution(EXECUTION_ID, COMPLETE_EXECUTION_BODY, {
      ...LIFECYCLE_OPTIONS,
      deadlineAtMs: Date.now() + 5_000,
    });

    assert.deepStrictEqual(result, { conflict: 'IDEMPOTENCY_PAYLOAD_MISMATCH', status: 'SUCCEEDED' });
    assert.strictEqual(lifecycleCalls, 1);
  });
});
