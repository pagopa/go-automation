import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry, type TestServiceOverrides } from '../../../registry/createTestServiceRegistry.js';
import { HttpPostStep } from '../HttpPostStep.js';

function createContext(args: {
  readonly vars?: Record<string, string>;
  readonly params?: Record<string, string>;
  readonly services?: TestServiceOverrides;
}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(),
    vars: new Map(Object.entries(args.vars ?? {})),
    params: new Map(Object.entries(args.params ?? {})),
    logs: [],
    services: createTestServiceRegistry(args.services ?? {}),
    recoveredErrors: [],
  };
}

describe('HttpPostStep', () => {
  const base = {
    id: 'post-webhook',
    label: 'Post webhook',
    url: 'https://example.invalid/hook',
    body: { alarm: 'B2B' },
  } as const;

  it('issues a POST with url and body and returns the response', async () => {
    const calls: unknown[][] = [];
    const http = {
      request: async (...args: unknown[]): Promise<unknown> => {
        await Promise.resolve();
        calls.push(args);
        return { status: 204 };
      },
    };

    const result = await new HttpPostStep(base).execute(createContext({ services: { http } }));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, { status: 204 });
    assert.deepStrictEqual(calls[0]?.slice(0, 3), ['POST', 'https://example.invalid/hook', { alarm: 'B2B' }]);
  });

  it('forwards the configured headers', async () => {
    const calls: unknown[][] = [];
    const http = {
      request: async (...args: unknown[]): Promise<unknown> => {
        await Promise.resolve();
        calls.push(args);
        return { status: 200 };
      },
    };

    await new HttpPostStep({ ...base, headers: { 'x-api-key': 'secret' } }).execute(
      createContext({ services: { http } }),
    );

    assert.deepStrictEqual(calls[0]?.[3], { 'x-api-key': 'secret' });
  });

  it('turns a transport failure into an unsuccessful result instead of throwing', async () => {
    const http = {
      request: async (): Promise<unknown> => {
        await Promise.resolve();
        throw new Error('fetch failed');
      },
    };

    const result = await new HttpPostStep(base).execute(createContext({ services: { http } }));

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /HTTP POST request failed: fetch failed/u);
  });
});
