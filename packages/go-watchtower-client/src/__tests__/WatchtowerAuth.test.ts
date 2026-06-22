import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { Core } from '@go-automation/go-common';

import { WatchtowerAuth } from '../WatchtowerAuth.js';

afterEach(() => mock.restoreAll());

describe('WatchtowerAuth', () => {
  it('performs service login once for concurrent token readers and caches only in memory', async () => {
    let calls = 0;
    mock.method(globalThis, 'fetch', async (): Promise<Response> => {
      calls += 1;
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
    const auth = new WatchtowerAuth(new Core.GOHttpClient({ baseUrl: 'https://watchtower.internal' }), {
      kind: 'SERVICE',
      serviceId: 'runbook-automation-worker',
      password: 'secret',
    });

    const tokens = await Promise.all([auth.getAccessToken(), auth.getAccessToken()]);

    assert.deepStrictEqual(tokens, ['access-token', 'access-token']);
    assert.strictEqual(calls, 1);
  });
});
