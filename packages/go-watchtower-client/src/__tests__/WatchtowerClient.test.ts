import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { WatchtowerClient } from '../WatchtowerClient.js';

afterEach(() => mock.restoreAll());

describe('WatchtowerClient', () => {
  it('retries an idempotent lifecycle callback with the same body and key', async () => {
    const bodies: string[] = [];
    const keys: string[] = [];
    let calls = 0;
    mock.method(globalThis, 'fetch', async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls += 1;
      if (calls === 1) {
        return await Promise.resolve(
          Response.json({
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresIn: 300,
            serviceId: 'runbook-automation-worker',
            principalType: 'SERVICE',
          }),
        );
      }
      const body = init?.body;
      if (typeof body !== 'string') throw new Error('Expected a materialized lifecycle body');
      bodies.push(body);
      keys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
      if (calls === 2) return await Promise.resolve(new Response('unavailable', { status: 503 }));
      return await Promise.resolve(Response.json({ status: 'SUCCEEDED', outcome: 'NO_RUNBOOK' }));
    });
    const client = serviceClient();

    const result = await client.completeExecution(
      '0192c000-0000-7000-8000-000000000001',
      { attemptId: '0192c000-0000-7000-8000-0000000000e1', outcome: 'NO_RUNBOOK' },
      { idempotencyKey: 'complete:execution:attempt', deadlineAtMs: Date.now() + 5_000 },
    );

    assert.deepStrictEqual(result, { status: 'SUCCEEDED', outcome: 'NO_RUNBOOK' });
    assert.deepStrictEqual(bodies, [bodies[0], bodies[0]]);
    assert.deepStrictEqual(keys, ['complete:execution:attempt', 'complete:execution:attempt']);
  });

  it('returns a typed 409 control response without retrying it', async () => {
    let lifecycleCalls = 0;
    mock.method(globalThis, 'fetch', async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (new Headers(init?.headers).has('authorization')) {
        lifecycleCalls += 1;
        return await Promise.resolve(
          Response.json(
            { conflict: 'IDEMPOTENCY_PAYLOAD_MISMATCH', status: 'SUCCEEDED' },
            { status: 409, statusText: 'Conflict' },
          ),
        );
      }
      return await Promise.resolve(
        Response.json({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 300,
          serviceId: 'runbook-automation-worker',
          principalType: 'SERVICE',
        }),
      );
    });
    const client = serviceClient();

    const result = await client.completeExecution(
      '0192c000-0000-7000-8000-000000000001',
      { attemptId: '0192c000-0000-7000-8000-0000000000e1', outcome: 'NO_RUNBOOK' },
      { idempotencyKey: 'complete:execution:attempt', deadlineAtMs: Date.now() + 5_000 },
    );

    assert.deepStrictEqual(result, { conflict: 'IDEMPOTENCY_PAYLOAD_MISMATCH', status: 'SUCCEEDED' });
    assert.strictEqual(lifecycleCalls, 1);
  });
});

function serviceClient(): WatchtowerClient {
  return new WatchtowerClient({
    baseUrl: 'https://watchtower.internal',
    credentials: { kind: 'SERVICE', serviceId: 'runbook-automation-worker', password: 'secret' },
  });
}
