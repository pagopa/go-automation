import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import { parseApiGwErrors } from '../ParseApiGwErrorsStep.js';

function createContext(stepOutput: unknown): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map<string, unknown>([['query-api-gw-logs', stepOutput]]),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

function buildRow(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

describe('parseApiGwErrors', () => {
  it('returns next=stop and apiGwErrorCount=0 when no rows meet the threshold', async () => {
    const step = parseApiGwErrors({
      id: 'parse',
      label: 'Parse',
      fromStep: 'query-api-gw-logs',
    });
    const ctx = createContext([buildRow({ status: '200' })]);
    const result = await step.execute(ctx);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.next, 'stop');
    assert.strictEqual(result.vars?.['apiGwErrorCount'], '0');
  });

  it('extracts xRayTraceId, statusCode and all extended fields from the first error row', async () => {
    const step = parseApiGwErrors({
      id: 'parse',
      label: 'Parse',
      fromStep: 'query-api-gw-logs',
    });
    const ctx = createContext([
      buildRow({
        status: '500',
        xrayTraceId: 'Root=1-abc-def',
        requestId: 'req-123',
        authorizerRequestId: 'auth-789',
        integrationRequestId: '-',
        errorMessage: 'Internal server error',
        httpMethod: 'PUT',
        path: '/v1/foo',
        authorizeStatus: '-',
        integrationServiceStatus: '-',
      }),
    ]);

    const result = await step.execute(ctx);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['apiGwStatusCode'], '500');
    assert.strictEqual(result.vars?.['xRayTraceId'], '1-abc-def');
    assert.strictEqual(result.vars?.['apiGwErrorMessage'], 'Internal server error');
    assert.strictEqual(result.vars?.['apiGwHttpMethod'], 'PUT');
    assert.strictEqual(result.vars?.['apiGwPath'], '/v1/foo');
    assert.strictEqual(result.vars?.['apiGwAuthorizerRequestId'], 'auth-789');
    assert.strictEqual(result.vars?.['apiGwIntegrationRequestId'], '-');
    assert.strictEqual(result.vars?.['apiGwAuthorizeStatus'], '-');
    assert.strictEqual(result.vars?.['apiGwIntegrationServiceStatus'], '-');
    assert.strictEqual(result.vars?.['apiGwRequestId'], 'req-123');
  });

  it("preserves the API Gateway '-' placeholder in vars but hides it from the typed output", async () => {
    const step = parseApiGwErrors({
      id: 'parse',
      label: 'Parse',
      fromStep: 'query-api-gw-logs',
    });
    const ctx = createContext([
      buildRow({
        status: '500',
        integrationRequestId: '-',
        errorMessage: 'Internal server error',
      }),
    ]);
    const result = await step.execute(ctx);
    assert.strictEqual(result.vars?.['apiGwIntegrationRequestId'], '-');
    const out = result.output;
    assert.ok(out !== undefined);
    assert.strictEqual(out.integrationRequestId, undefined);
    assert.strictEqual(out.errorMessage, 'Internal server error');
  });

  it('filters rows below the configured threshold', async () => {
    const step = parseApiGwErrors({
      id: 'parse',
      label: 'Parse',
      fromStep: 'query-api-gw-logs',
      minStatusCode: 500,
    });
    const ctx = createContext([buildRow({ status: '404' }), buildRow({ status: '503', xrayTraceId: 'Root=1-x' })]);
    const result = await step.execute(ctx);
    assert.strictEqual(result.vars?.['apiGwErrorCount'], '1');
    assert.strictEqual(result.vars?.['apiGwStatusCode'], '503');
  });

  it('keeps rows whose only error signal is on authorizeStatus or integrationServiceStatus', async () => {
    const step = parseApiGwErrors({ id: 'parse', label: 'Parse', fromStep: 'query-api-gw-logs' });
    // status='-', authorizeStatus='500' → should still count as an error row
    const ctx = createContext([
      buildRow({
        status: '-',
        authorizeStatus: '500',
        integrationServiceStatus: '-',
        xrayTraceId: 'Root=1-aaa',
      }),
      buildRow({
        status: '-',
        authorizeStatus: '-',
        integrationServiceStatus: '503',
        xrayTraceId: 'Root=1-bbb',
      }),
    ]);
    const result = await step.execute(ctx);
    assert.strictEqual(result.success, true);
    assert.notStrictEqual(result.next, 'stop');
    assert.strictEqual(result.vars?.['apiGwErrorCount'], '2');
    // `apiGwStatusCode` falls back to authorizeStatus when status='-'.
    assert.strictEqual(result.vars?.['apiGwStatusCode'], '500');
  });

  it('apiGwStatusCode falls back to integrationServiceStatus when status and authorizeStatus are both "-"', async () => {
    const step = parseApiGwErrors({ id: 'parse', label: 'Parse', fromStep: 'query-api-gw-logs' });
    const ctx = createContext([
      buildRow({
        status: '-',
        authorizeStatus: '-',
        integrationServiceStatus: '502',
        xrayTraceId: 'Root=1-zzz',
      }),
    ]);
    const result = await step.execute(ctx);
    assert.strictEqual(result.vars?.['apiGwStatusCode'], '502');
  });

  it('prefers `status` over the other two when all three are present', async () => {
    const step = parseApiGwErrors({ id: 'parse', label: 'Parse', fromStep: 'query-api-gw-logs' });
    const ctx = createContext([
      buildRow({
        status: '500',
        authorizeStatus: '401',
        integrationServiceStatus: '503',
      }),
    ]);
    const result = await step.execute(ctx);
    assert.strictEqual(result.vars?.['apiGwStatusCode'], '500');
  });

  it('still drops rows whose three status fields are all below the threshold', async () => {
    const step = parseApiGwErrors({ id: 'parse', label: 'Parse', fromStep: 'query-api-gw-logs' });
    const ctx = createContext([buildRow({ status: '404', authorizeStatus: '200', integrationServiceStatus: '-' })]);
    const result = await step.execute(ctx);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.next, 'stop');
    assert.strictEqual(result.vars?.['apiGwErrorCount'], '0');
  });

  it('returns failure when the upstream step output is missing', async () => {
    const step = parseApiGwErrors({
      id: 'parse',
      label: 'Parse',
      fromStep: 'missing-step',
    });
    const ctx = createContext([buildRow({ status: '500' })]);
    const result = await step.execute(ctx);
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Step output not found/);
  });
});
