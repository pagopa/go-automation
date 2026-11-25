import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { requestUrl, serviceClient, serviceLoginResponse, WATCHTOWER_BASE_URL } from './watchtowerTestDoubles.js';

afterEach(() => mock.restoreAll());

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

  it('renews the access token once and repeats a read rejected with 401', async () => {
    const authorizations: string[] = [];
    let logins = 0;
    mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const authorization = new Headers(init?.headers).get('authorization');
      if (authorization === null) {
        logins += 1;
        return await Promise.resolve(serviceLoginResponse());
      }
      authorizations.push(authorization);
      if (authorizations.length === 1) return new Response('expired', { status: 401 });
      assert.match(requestUrl(input), /\/api\/products$/);
      return await Promise.resolve(Response.json([]));
    });

    const products = await serviceClient().listProducts();

    assert.deepStrictEqual(products, []);
    assert.strictEqual(authorizations.length, 2);
    assert.ok(logins >= 1);
  });
});
