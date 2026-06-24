import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOHttpRequestOptions, GOHttpResponse } from '@go-automation/go-common/core';

import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import { HttpRequestStep } from '../HttpRequestStep.js';

interface HttpCall {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
  readonly headers: Record<string, string> | undefined;
  readonly options: GOHttpRequestOptions | undefined;
}

describe('HttpRequestStep', () => {
  it('returns trace info with interpolated values and redacted sensitive headers', () => {
    const step = new HttpRequestStep({
      id: 'fetch-status',
      label: 'Fetch status',
      method: 'GET',
      url: 'https://api.example.com/status/{{params.serviceId}}',
      headers: {
        Authorization: 'Bearer {{vars.token}}',
        'X-Service': '{{params.serviceId}}',
      },
      body: 'service={{params.serviceId}} token={{vars.token}}',
    });

    const info = step.getTraceInfo(
      makeContext({
        params: [['serviceId', 'svc-1']],
        vars: [['token', 'secret-token']],
      }),
    );

    assert.deepStrictEqual(info, {
      method: 'GET',
      url: 'https://api.example.com/status/svc-1',
      headers: {
        Authorization: '***REDACTED***',
        'X-Service': 'svc-1',
      },
      body: 'service=svc-1 token=secret-token',
    });
  });

  it('executes the configured request through the context HTTP client', async () => {
    const calls: HttpCall[] = [];
    const response: GOHttpResponse<unknown> = {
      data: { ok: true },
      statusCode: 202,
      statusText: 'Accepted',
      headers: { 'x-request-id': 'req-1' },
      attemptsUsed: 1,
    };
    const signal = new AbortController().signal;
    const step = new HttpRequestStep({
      id: 'fetch-status',
      label: 'Fetch status',
      method: 'POST',
      url: 'https://api.example.com/status/{{params.serviceId}}?query={{vars.query}}',
      headers: { Authorization: 'Bearer {{vars.token}}' },
      body: 'service={{params.serviceId}}',
    });

    const result = await step.execute(
      makeContext({
        params: [['serviceId', 'svc 1']],
        vars: [
          ['query', 'a/b'],
          ['token', 'secret-token'],
        ],
        services: {
          http: {
            async request(
              method: string,
              url: string,
              body?: unknown,
              headers?: Record<string, string>,
              options?: GOHttpRequestOptions,
            ): Promise<GOHttpResponse<unknown>> {
              calls.push({ method, url, body, headers, options });
              await Promise.resolve();
              return response;
            },
          },
        } as unknown as ServiceRegistry,
        signal,
      }),
    );

    assert.deepStrictEqual(result, { success: true, output: response });
    assert.deepStrictEqual(calls, [
      {
        method: 'POST',
        url: 'https://api.example.com/status/svc%201?query=a%2Fb',
        body: 'service=svc 1',
        headers: { Authorization: 'Bearer secret-token' },
        options: { signal },
      },
    ]);
  });
});

function makeContext(options: {
  readonly params?: ReadonlyArray<readonly [string, string]>;
  readonly vars?: ReadonlyArray<readonly [string, string]>;
  readonly services?: ServiceRegistry;
  readonly signal?: AbortSignal;
}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(options.vars ?? []),
    params: new Map(options.params ?? []),
    logs: [],
    services: options.services ?? ({} as unknown as ServiceRegistry),
    recoveredErrors: [],
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
}
