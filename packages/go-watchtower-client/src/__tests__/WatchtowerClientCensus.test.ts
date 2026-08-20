import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { WatchtowerClient } from '../WatchtowerClient.js';

afterEach(() => mock.restoreAll());

const PRODUCT_ID = '0192c000-0000-7000-8000-0000000000aa';

describe('WatchtowerClient census reads', () => {
  it('requests every census endpoint on its documented path', async () => {
    const { client, requestedPaths } = censusClient();

    await client.listProductResources(PRODUCT_ID);
    await client.listProductDownstreams(PRODUCT_ID);
    await client.listProductFinalActions(PRODUCT_ID);
    await client.listProductRunbooks(PRODUCT_ID);
    await client.listIgnoreReasons();

    assert.deepStrictEqual(requestedPaths, [
      `/api/products/${PRODUCT_ID}/resources`,
      `/api/products/${PRODUCT_ID}/downstreams`,
      `/api/products/${PRODUCT_ID}/final-actions`,
      `/api/products/${PRODUCT_ID}/runbooks`,
      '/api/ignore-reasons',
    ]);
  });

  it('encodes a product identifier that is not URL safe', async () => {
    const { client, requestedPaths } = censusClient();

    await client.listProductDownstreams('a b/c');

    assert.deepStrictEqual(requestedPaths, ['/api/products/a%20b%2Fc/downstreams']);
  });

  it('aggregates the five per-product taxonomies into a single census', async () => {
    const { client, requestedPaths } = censusClient();

    const census = await client.getProductCensus(PRODUCT_ID);

    assert.strictEqual(census.productId, PRODUCT_ID);
    assert.deepStrictEqual(
      [...requestedPaths].sort(),
      [
        `/api/products/${PRODUCT_ID}/alarms`,
        `/api/products/${PRODUCT_ID}/downstreams`,
        `/api/products/${PRODUCT_ID}/final-actions`,
        `/api/products/${PRODUCT_ID}/resources`,
        `/api/products/${PRODUCT_ID}/runbooks`,
      ].sort(),
    );
    assert.deepStrictEqual(census.downstreams, [{ id: 'd-1', name: 'Nessuno' }]);
  });

  it('keeps the census fan-out bounded to the five taxonomy requests', async () => {
    const { client, requestedPaths } = censusClient();

    await client.getProductCensus(PRODUCT_ID);

    assert.strictEqual(requestedPaths.length, 5);
  });

  it('propagates a census read failure instead of returning a partial census', async () => {
    const { client } = censusClient({ failPathSuffix: '/final-actions' });

    await assert.rejects(async () => await client.getProductCensus(PRODUCT_ID));
  });
});

interface CensusClientOptions {
  readonly failPathSuffix?: string;
}

function censusClient(options: CensusClientOptions = {}): {
  readonly client: WatchtowerClient;
  readonly requestedPaths: string[];
} {
  const requestedPaths: string[] = [];
  mock.method(globalThis, 'fetch', async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname;
    if (path === '/auth/service/login') {
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
    requestedPaths.push(path);
    if (options.failPathSuffix !== undefined && path.endsWith(options.failPathSuffix)) {
      return await Promise.resolve(new Response('boom', { status: 500 }));
    }
    return await Promise.resolve(Response.json([{ id: 'd-1', name: 'Nessuno' }]));
  });

  const client = new WatchtowerClient({
    baseUrl: 'https://watchtower.internal',
    credentials: { kind: 'SERVICE', serviceId: 'runbook-automation-worker', password: 'secret' },
  });
  return { client, requestedPaths };
}
