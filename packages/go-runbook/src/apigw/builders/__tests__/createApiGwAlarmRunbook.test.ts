import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createApiGwAlarmRunbook } from '../createApiGwAlarmRunbook.js';
import type { ApiGwAlarmConfig } from '../../types/ApiGwAlarmConfig.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { StepDescriptor } from '../../../types/StepDescriptor.js';
import type { KnownCase } from '../../../types/KnownCase.js';

function fakeContext(params: ReadonlyArray<readonly [string, string]>): RunbookContext {
  return {
    executionId: 'x',
    startedAt: new Date(),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map(params),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

function getTraceQuery(traceInfo: Readonly<Record<string, unknown>> | undefined): string {
  const value = traceInfo?.['query'];
  return typeof value === 'string' ? value : '';
}

function baseConfig(overrides: Partial<ApiGwAlarmConfig> = {}): ApiGwAlarmConfig {
  const knownCases: ReadonlyArray<KnownCase> = [];
  return {
    id: 'test-runbook',
    metadata: {
      name: 'Test runbook',
      description: 'desc',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    apiGwLogGroup: '/aws/apigw/main',
    services: [
      { name: 'pn-a', logGroup: '/aws/ecs/pn-a', varPrefix: 'a' },
      { name: 'pn-b', logGroup: '/aws/ecs/pn-b', varPrefix: 'b' },
    ],
    knownUrls: [],
    knownCases,
    ...overrides,
  };
}

describe('createApiGwAlarmRunbook', () => {
  it('builds a runbook with the canonical step ordering', () => {
    const runbook = createApiGwAlarmRunbook(baseConfig());
    const stepIds = runbook.steps.map((d) => d.step.id);

    assert.deepStrictEqual(stepIds, [
      'query-api-gw-logs',
      'parse-api-gw-errors',
      'query-pn-a',
      'analyze-pn-a',
      'query-pn-b',
      'analyze-pn-b',
    ]);
  });

  it('applies the continueOnFailure default (false on first service, true on the rest)', () => {
    const runbook = createApiGwAlarmRunbook(baseConfig());
    const byId = new Map(runbook.steps.map((d) => [d.step.id, d]));

    assert.strictEqual(byId.get('query-pn-a')?.continueOnFailure, undefined);
    assert.strictEqual(byId.get('analyze-pn-a')?.continueOnFailure, undefined);
    assert.strictEqual(byId.get('query-pn-b')?.continueOnFailure, true);
    assert.strictEqual(byId.get('analyze-pn-b')?.continueOnFailure, true);
  });

  it('honours an explicit continueOnFailure on the first service', () => {
    const runbook = createApiGwAlarmRunbook(
      baseConfig({
        services: [
          { name: 'pn-a', logGroup: '/aws/ecs/pn-a', varPrefix: 'a', continueOnFailure: true },
          { name: 'pn-b', logGroup: '/aws/ecs/pn-b', varPrefix: 'b', continueOnFailure: false },
        ],
      }),
    );
    const byId = new Map(runbook.steps.map((d) => [d.step.id, d]));

    assert.strictEqual(byId.get('query-pn-a')?.continueOnFailure, true);
    assert.strictEqual(byId.get('query-pn-b')?.continueOnFailure, undefined);
  });

  it('emits a resolve-url step only for services with detectNextService=true', () => {
    const runbook = createApiGwAlarmRunbook(
      baseConfig({
        services: [
          { name: 'pn-a', logGroup: '/aws/ecs/pn-a', varPrefix: 'a', detectNextService: true },
          { name: 'pn-b', logGroup: '/aws/ecs/pn-b', varPrefix: 'b' },
        ],
        knownUrls: [{ kind: 'external', url: 'https://x/', downstream: 'X' }],
      }),
    );
    const stepIds = runbook.steps.map((d) => d.step.id);

    assert.ok(stepIds.includes('resolve-url-pn-a'));
    assert.ok(!stepIds.includes('resolve-url-pn-b'));
  });

  it('inserts preSteps between parse and per-service pipeline', () => {
    const preStep = {
      step: {
        id: 'pre-1',
        label: 'Pre step',
        kind: 'control' as const,
        // eslint-disable-next-line @typescript-eslint/require-await
        execute: async () => ({ success: true as const }),
      },
      continueOnFailure: true,
    } satisfies StepDescriptor;
    const runbook = createApiGwAlarmRunbook(baseConfig({ preSteps: [preStep] }));
    const stepIds = runbook.steps.map((d) => d.step.id);

    assert.deepStrictEqual(stepIds.slice(0, 4), ['query-api-gw-logs', 'parse-api-gw-errors', 'pre-1', 'query-pn-a']);

    const preDescriptor = runbook.steps.find((d) => d.step.id === 'pre-1');
    assert.strictEqual(preDescriptor?.continueOnFailure, true);
  });

  it('resolves the {{minStatusCode}} placeholder at build time (default 500)', () => {
    const runbook = createApiGwAlarmRunbook(baseConfig());
    const apiGwStep = runbook.steps.find((d) => d.step.id === 'query-api-gw-logs');
    const traceInfo = apiGwStep?.step.getTraceInfo?.(
      fakeContext([
        ['startTime', '2026-01-01T00:00:00.000Z'],
        ['endTime', '2026-01-01T00:10:00.000Z'],
      ]),
    );
    const query = getTraceQuery(traceInfo);
    assert.match(query, /filter status >= 500 or authorizeStatus >= 500 or integrationServiceStatus >= 500/);
    assert.doesNotMatch(query, /\{\{minStatusCode\}\}/);
  });

  it('respects a custom minStatusCode', () => {
    const runbook = createApiGwAlarmRunbook(baseConfig({ minStatusCode: 400 }));
    const apiGwStep = runbook.steps.find((d) => d.step.id === 'query-api-gw-logs');
    const traceInfo = apiGwStep?.step.getTraceInfo?.(
      fakeContext([
        ['startTime', '2026-01-01T00:00:00.000Z'],
        ['endTime', '2026-01-01T00:10:00.000Z'],
      ]),
    );
    const query = getTraceQuery(traceInfo);
    assert.match(query, /filter status >= 400 or authorizeStatus >= 400 or integrationServiceStatus >= 400/);
  });

  it('uses a default fallback action including UrlNeedsRoutingFix', () => {
    const runbook = createApiGwAlarmRunbook(baseConfig());
    assert.strictEqual(runbook.fallbackAction.type, 'log');
    if (runbook.fallbackAction.type === 'log') {
      assert.match(runbook.fallbackAction.message, /needsRoutingFix=\{\{vars\.aUrlNeedsRoutingFix\}\}/);
      assert.match(runbook.fallbackAction.message, /needsRoutingFix=\{\{vars\.bUrlNeedsRoutingFix\}\}/);
    }
  });

  it('honours a custom fallback action', () => {
    const runbook = createApiGwAlarmRunbook(
      baseConfig({
        fallbackAction: { type: 'log', level: 'error', message: 'custom' },
      }),
    );
    assert.strictEqual(runbook.fallbackAction.type, 'log');
    if (runbook.fallbackAction.type === 'log') {
      assert.strictEqual(runbook.fallbackAction.message, 'custom');
    }
  });

  it('forwards known cases and maxIterations to the builder', () => {
    const knownCase: KnownCase = {
      id: 'demo',
      description: 'demo case',
      priority: 1,
      condition: { type: 'exists', ref: 'vars.foo' },
      action: { type: 'log', level: 'info', message: 'hit' },
    };
    const runbook = createApiGwAlarmRunbook(baseConfig({ knownCases: [knownCase], maxIterations: 42 }));
    assert.strictEqual(runbook.knownCases.length, 1);
    assert.strictEqual(runbook.knownCases[0]?.id, 'demo');
    assert.strictEqual(runbook.maxIterations, 42);
  });

  it('validates the underlying RunbookBuilder (no empty steps allowed)', () => {
    assert.doesNotThrow(() => createApiGwAlarmRunbook(baseConfig()));
  });
});
