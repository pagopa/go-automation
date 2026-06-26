import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { Core } from '@go-automation/go-common';

import { WatchtowerAuth } from '../WatchtowerAuth.js';

afterEach(() => mock.restoreAll());

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestBodyText(body: unknown): string {
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  throw new Error('Unsupported request body type in test');
}

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

  it('logs in scoped CLI PAT credentials through the CLI login endpoint', async () => {
    let requestedUrl = '';
    let requestedBody = '';
    mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      requestedUrl = requestUrl(input);
      requestedBody = requestBodyText(init?.body);
      return await Promise.resolve(
        Response.json({
          accessToken: 'cli-access-token',
          refreshToken: 'cli-refresh-token',
          expiresIn: 300,
          principalType: 'HUMAN',
          authMethod: 'CLI_PAT',
          scope: ['RUNBOOK_AUTOMATION_CLI'],
        }),
      );
    });
    const auth = new WatchtowerAuth(new Core.GOHttpClient({ baseUrl: 'https://watchtower.internal' }), {
      kind: 'CLI_PAT',
      token: 'wtcli_token',
    });

    const token = await auth.getAccessToken();

    assert.strictEqual(token, 'cli-access-token');
    assert.match(requestedUrl, /\/auth\/cli-login$/);
    assert.deepStrictEqual(JSON.parse(requestedBody) as unknown, { token: 'wtcli_token' });
  });
});
