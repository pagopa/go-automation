import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { HttpPostStep } from '../HttpPostStep.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';

describe('HttpPostStep', () => {
  const base = {
    id: 'post-webhook',
    label: 'Post webhook',
    url: 'https://example.invalid/hook',
    body: { alarm: 'B2B' },
  } as const;

  it('issues a POST with url, body and the configured headers and returns the response', async () => {
    const calls: unknown[][] = [];
    const request = async (...args: unknown[]): Promise<unknown> => {
      calls.push(args);
      return Promise.resolve({ status: 204 });
    };

    const result = await new HttpPostStep({ ...base, headers: { 'x-api-key': 'secret' } }).execute(
      createTestContext({ services: { http: { request } } }),
    );

    assert.deepStrictEqual(result, { success: true, output: { status: 204 } });
    assert.deepStrictEqual(calls[0]?.slice(0, 4), [
      'POST',
      'https://example.invalid/hook',
      { alarm: 'B2B' },
      { 'x-api-key': 'secret' },
    ]);
  });

  it('turns a transport failure into an unsuccessful result instead of throwing', async () => {
    const request = async (): Promise<unknown> => Promise.reject(new Error('fetch failed'));

    const result = await new HttpPostStep(base).execute(createTestContext({ services: { http: { request } } }));

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /HTTP POST request failed: fetch failed/u);
  });
});
