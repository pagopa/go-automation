import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ResultField } from '@go-automation/go-common/aws';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import { AnalyzeInteropApiGwAggregatesStep } from '../steps/AnalyzeInteropApiGwAggregatesStep.js';

function row(fields: ReadonlyArray<readonly [string, string]>): ReadonlyArray<ResultField> {
  return fields.map(([field, value]) => ({ field, value }));
}

describe('AnalyzeInteropApiGwAggregatesStep', () => {
  it('sums aggregate counts and keeps representative fields from the dominant row', async () => {
    const rows = [
      row([
        ['count', '1'],
        ['status', '401'],
        ['integrationError', 'zeta'],
        ['httpMethod', 'GET'],
        ['requestPath', '/minor'],
      ]),
      row([
        ['count', '20'],
        ['status', '429'],
        ['integrationError', 'dominant'],
        ['httpMethod', 'POST'],
        ['requestPath', '/dominant'],
        ['sourceIp', '203.0.113.20'],
      ]),
    ];
    const context: RunbookContext = {
      executionId: 'test',
      startedAt: new Date('2026-08-24T10:00:00.000Z'),
      stepResults: new Map([['query', rows]]),
      vars: new Map(),
      params: new Map(),
      logs: [],
      services: {} as ServiceRegistry,
      recoveredErrors: [],
    };
    const step = new AnalyzeInteropApiGwAggregatesStep({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      errorFamilyLabel: '4xx',
    });

    const result = await step.execute(context);
    assert.strictEqual(result.output?.errorCount, 21);
    assert.strictEqual(result.vars?.['apiGwStatusCode'], '429');
    assert.strictEqual(result.vars?.['apiGwErrorMessage'], 'dominant');
    assert.strictEqual(result.vars?.['apiGwHttpMethod'], 'POST');
    assert.strictEqual(result.vars?.['apiGwPath'], '/dominant');
    assert.strictEqual(result.vars?.['apiGwSourceIp'], '203.0.113.20');
    assert.deepStrictEqual(result.output?.integrationErrors, ['dominant', 'zeta']);
  });

  it('uses a deterministic representative row when aggregate counts are tied', async () => {
    const first = row([
      ['count', '10'],
      ['status', '429'],
      ['integrationError', 'zeta'],
      ['httpMethod', 'POST'],
      ['requestPath', '/zeta'],
    ]);
    const second = row([
      ['count', '10'],
      ['status', '401'],
      ['integrationError', 'alpha'],
      ['httpMethod', 'GET'],
      ['requestPath', '/alpha'],
    ]);
    const step = new AnalyzeInteropApiGwAggregatesStep({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      errorFamilyLabel: '4xx',
    });

    const forward = await step.execute(contextWithRows([first, second]));
    const reverse = await step.execute(contextWithRows([second, first]));

    assert.deepStrictEqual(forward.output, reverse.output);
    assert.deepStrictEqual(forward.vars, reverse.vars);
    assert.deepStrictEqual(forward.output?.integrationErrors, ['alpha', 'zeta']);
    assert.strictEqual(forward.vars?.['apiGwStatusCode'], '401');
    assert.strictEqual(forward.vars?.['apiGwErrorMessage'], 'alpha');
    assert.strictEqual(forward.vars?.['apiGwHttpMethod'], 'GET');
    assert.strictEqual(forward.vars?.['apiGwPath'], '/alpha');
  });

  it('drops API Gateway placeholder values from the analysis and representative variables', async () => {
    const rows = [
      row([
        ['count', '2'],
        ['status', '403'],
        ['integrationStatus', '-'],
        ['integrationError', ' - '],
        ['httpMethod', 'GET'],
        ['requestPath', '/token.oauth2'],
        ['sourceIp', '-'],
      ]),
    ];
    const context: RunbookContext = {
      executionId: 'test',
      startedAt: new Date('2026-08-24T10:00:00.000Z'),
      stepResults: new Map([['query', rows]]),
      vars: new Map(),
      params: new Map(),
      logs: [],
      services: {} as ServiceRegistry,
      recoveredErrors: [],
    };
    const step = new AnalyzeInteropApiGwAggregatesStep({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      errorFamilyLabel: '4xx',
    });

    const result = await step.execute(context);
    assert.deepStrictEqual(result.output?.integrationStatuses, []);
    assert.deepStrictEqual(result.output?.integrationErrors, []);
    assert.deepStrictEqual(result.output?.sourceIps, []);
    assert.strictEqual(result.vars?.['apiGwIntegrationStatus'], '');
    assert.strictEqual(result.vars?.['apiGwErrorMessage'], '');
    assert.strictEqual(result.vars?.['apiGwSourceIp'], '');
  });
});

function contextWithRows(rows: ReadonlyArray<ReadonlyArray<ResultField>>): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-08-24T10:00:00.000Z'),
    stepResults: new Map([['query', rows]]),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: {} as ServiceRegistry,
    recoveredErrors: [],
  };
}
