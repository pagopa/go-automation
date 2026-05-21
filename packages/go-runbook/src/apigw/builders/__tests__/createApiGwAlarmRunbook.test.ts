import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOLogger } from '@go-automation/go-common/core';
import type { ResultField } from '@go-automation/go-common/aws';

import { createApiGwAlarmRunbook } from '../createApiGwAlarmRunbook.js';
import type { ApiGwAlarmConfig } from '../../types/ApiGwAlarmConfig.js';
import { isApiGwRunbookContext } from '../../output/ApiGwRunbookContext.js';
import { API_GW_AUTHORIZER_LAMBDAS } from '../../authorizers/ApiGwAuthorizerLambdaRegistry.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { StepDescriptor } from '../../../types/StepDescriptor.js';
import type { KnownCase } from '../../../types/KnownCase.js';
import { RunbookEngine } from '../../../core/RunbookEngine.js';
import { ConditionEvaluator } from '../../../core/ConditionEvaluator.js';

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

function cwRow(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
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
    // V04: default entry service has executionLogGroup so the execution
    // log branch is wired by default. Tests for the no-exec-log case can
    // override entryService explicitly.
    entryService: {
      name: 'pn-a',
      logGroup: '/aws/ecs/pn-a',
      executionLogGroup: 'API-Gateway-Execution-Logs_default/prod',
      varPrefix: 'a',
    },
    services: [{ name: 'pn-b', logGroup: '/aws/ecs/pn-b', varPrefix: 'b' }],
    knownUrls: [],
    knownCases,
    ...overrides,
  };
}

describe('createApiGwAlarmRunbook', () => {
  it('builds the canonical step ordering with AccessLog parsing under the preparation section', () => {
    const runbook = createApiGwAlarmRunbook(baseConfig());
    const stepIds = runbook.steps.map((d) => d.step.id);

    assert.deepStrictEqual(stepIds, [
      'prepare-api-gw-section',
      'query-api-gw-logs',
      'parse-api-gw-errors',
      'query-api-gw-execution-logs',
      'stop-api-gw-execution-log-unresolved',
      'query-pn-a',
      'analyze-pn-a',
      'decide-pn-a',
      'query-pn-b',
      'analyze-pn-b',
      'decide-pn-b',
    ]);
  });

  it('exposes API Gateway runbookContext for output builders', () => {
    const runbook = createApiGwAlarmRunbook(baseConfig());

    assert.ok(isApiGwRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.apiGwLogGroup, '/aws/apigw/main');
    assert.strictEqual(runbook.runbookContext.queryProfileId, 'send');
    assert.deepStrictEqual(
      runbook.runbookContext.services.map((service) => service.name),
      ['pn-a', 'pn-b'],
    );
  });

  it('marks every apigw step as silent so engine logging does not double-render', () => {
    const runbook = createApiGwAlarmRunbook(baseConfig());
    const apigwIds = new Set([
      'prepare-api-gw-section',
      'query-api-gw-logs',
      'query-api-gw-execution-logs',
      'stop-api-gw-execution-log-unresolved',
      'parse-api-gw-errors',
      'query-pn-a',
      'analyze-pn-a',
      'decide-pn-a',
      'query-pn-b',
      'analyze-pn-b',
      'decide-pn-b',
    ]);
    for (const descriptor of runbook.steps) {
      if (apigwIds.has(descriptor.step.id)) {
        assert.strictEqual(descriptor.silent, true, `step ${descriptor.step.id} should be silent`);
      }
    }
  });

  it('generates a decide step for every service, with goTo targets resolvable in the step graph', () => {
    const runbook = createApiGwAlarmRunbook(baseConfig());
    const stepIds = new Set(runbook.steps.map((d) => d.step.id));

    assert.ok(stepIds.has('decide-pn-a'));
    assert.ok(stepIds.has('decide-pn-b'));
    // The goTo targets emitted at runtime point to `query-<svc>` ids.
    assert.ok(stepIds.has('query-pn-a'));
    assert.ok(stepIds.has('query-pn-b'));
  });

  it('throws on duplicate service names', () => {
    assert.throws(
      () =>
        createApiGwAlarmRunbook(
          baseConfig({
            services: [{ name: 'pn-a', logGroup: '/aws/ecs/dup', varPrefix: 'dup' }],
          }),
        ),
      /Duplicate service name/,
    );
  });

  it('inserts custom preSteps between parse-api-gw-errors and the entry-service triplet', () => {
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

    assert.deepStrictEqual(stepIds.slice(0, 7), [
      'prepare-api-gw-section',
      'query-api-gw-logs',
      'parse-api-gw-errors',
      'query-api-gw-execution-logs',
      'stop-api-gw-execution-log-unresolved',
      'pre-1',
      'query-pn-a',
    ]);

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
    assert.match(query, /filter status >= 500 or authorizerStatus >= 500 or integrationServiceStatus >= 500/);
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
    assert.match(query, /filter status >= 400 or authorizerStatus >= 400 or integrationServiceStatus >= 400/);
  });

  it('wires the authorizer gate after access-log parsing and before execution logs when configured', () => {
    const runbook = createApiGwAlarmRunbook(
      baseConfig({
        authorizerFailureCheck: {
          defaultAuthorizer: API_GW_AUTHORIZER_LAMBDAS['pn-ioAuthorizerLambda'],
        },
      }),
    );
    const stepIds = runbook.steps.map((d) => d.step.id);

    assert.deepStrictEqual(stepIds.slice(0, 5), [
      'prepare-api-gw-section',
      'query-api-gw-logs',
      'parse-api-gw-errors',
      'evaluate-api-gw-authorizer-failure',
      'query-api-gw-execution-logs',
    ]);
    assert.ok(runbook.knownCases.some((knownCase) => knownCase.id === 'api-gw-authorizer-timeout'));
    assert.ok(runbook.knownCases.some((knownCase) => knownCase.id === 'api-gw-authorizer-error'));
  });

  it('uses a default fallback action that exposes structured unknown-case context', () => {
    const runbook = createApiGwAlarmRunbook(baseConfig());
    assert.strictEqual(runbook.fallbackAction.type, 'log');
    if (runbook.fallbackAction.type === 'log') {
      assert.match(runbook.fallbackAction.message, /^\[CASO NON RICONOSCIUTO\]/);
      assert.match(runbook.fallbackAction.message, /Errori API Gateway: \{\{vars\.apiGwErrorCount\}\}/);
      assert.match(runbook.fallbackAction.message, /X-Ray Trace ID: \{\{vars\.xRayTraceId\}\}/);
      assert.match(runbook.fallbackAction.message, /pn-a: msg=\{\{vars\.aErrorMsg\}\}; url=/);
      assert.match(runbook.fallbackAction.message, /pn-b: msg=\{\{vars\.bErrorMsg\}\}; url=/);
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

  it('stops on every matching known case before following a KnownUrl target', async () => {
    const knownCases: ReadonlyArray<KnownCase> = [
      {
        id: 'primary',
        description: 'Primary matching case',
        priority: 20,
        condition: { type: 'compare', ref: 'vars.aNextUrlTarget', operator: '==', value: 'pn-b' },
        action: { type: 'log', level: 'info', message: 'primary' },
      },
      {
        id: 'secondary',
        description: 'Secondary matching case',
        priority: 10,
        condition: { type: 'compare', ref: 'vars.aNextUrlTarget', operator: '==', value: 'pn-b' },
        action: { type: 'log', level: 'info', message: 'secondary' },
      },
    ];
    const calls: string[] = [];
    const services = {
      cloudWatchLogs: {
        query: async (
          logGroups: ReadonlyArray<string>,
          _query: string,
        ): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> => {
          await Promise.resolve();
          const logGroup = logGroups[0] ?? '';
          calls.push(logGroup);
          if (logGroup === '/aws/apigw/main') {
            return [
              cwRow({
                status: '500',
                authorizerStatus: '-',
                integrationServiceStatus: '-',
                xrayTraceId: 'Root=1-abc',
              }),
            ];
          }
          if (logGroup === '/aws/ecs/pn-a') {
            return [
              cwRow({
                level: 'ERROR',
                '@message': 'boom calling http://internal/pn-b/resource',
              }),
            ];
          }
          return [cwRow({ level: 'ERROR', '@message': 'pn-b should not be queried' })];
        },
      },
    } as unknown as ServiceRegistry;

    const runbook = createApiGwAlarmRunbook(
      baseConfig({
        knownCases,
        knownUrls: [{ url: 'http://internal/pn-b/', target: 'pn-b' }],
      }),
    );

    const result = await new RunbookEngine(new GOLogger(), new ConditionEvaluator()).execute(
      runbook,
      new Map([
        ['startTime', '2026-01-01T00:00:00.000Z'],
        ['endTime', '2026-01-01T00:10:00.000Z'],
      ]),
      services,
    );

    assert.deepStrictEqual(
      result.matchedCases.map((c) => c.id),
      ['primary', 'secondary'],
    );
    assert.strictEqual(result.resolvedAtStep, 'analyze-pn-a');
    assert.deepStrictEqual(calls, ['/aws/apigw/main', '/aws/ecs/pn-a']);
  });

  it('stops before execution logs and service traversal when the authorizer gate resolves a timeout', async () => {
    const calls: string[] = [];
    const services = {
      cloudWatchLogs: {
        query: async (logGroups: ReadonlyArray<string>): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> => {
          await Promise.resolve();
          const logGroup = logGroups[0] ?? '';
          calls.push(logGroup);
          if (logGroup === '/aws/apigw/main') {
            return [
              cwRow({
                status: '-',
                authorizerStatus: '500',
                authorizerLatency: '5000',
                authorizerRequestId: 'auth-req-1',
                integrationServiceStatus: '-',
                path: '/resource-a',
                httpMethod: 'GET',
              }),
            ];
          }
          return [];
        },
      },
    } as unknown as ServiceRegistry;

    const runbook = createApiGwAlarmRunbook(
      baseConfig({
        authorizerFailureCheck: {
          defaultAuthorizer: API_GW_AUTHORIZER_LAMBDAS['pn-ioAuthorizerLambda'],
        },
      }),
    );

    const result = await new RunbookEngine(new GOLogger(), new ConditionEvaluator()).execute(
      runbook,
      new Map([
        ['startTime', '2026-01-01T00:00:00.000Z'],
        ['endTime', '2026-01-01T00:10:00.000Z'],
      ]),
      services,
    );

    assert.deepStrictEqual(
      result.matchedCases.map((c) => c.id),
      ['api-gw-authorizer-timeout'],
    );
    assert.strictEqual(result.resolvedAtStep, 'evaluate-api-gw-authorizer-failure');
    assert.strictEqual(result.finalContext.vars.get('apiGwAuthorizerRequestId'), 'auth-req-1');
    assert.deepStrictEqual(calls, ['/aws/apigw/main']);
  });

  it('continues with service traversal when authorizerStatus is missing', async () => {
    const calls: string[] = [];
    const services = {
      cloudWatchLogs: {
        query: async (logGroups: ReadonlyArray<string>): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> => {
          await Promise.resolve();
          const logGroup = logGroups[0] ?? '';
          calls.push(logGroup);
          if (logGroup === '/aws/apigw/main') {
            return [
              cwRow({
                status: '500',
                authorizerRequestId: 'auth-req-2',
                integrationRequestId: '-',
                integrationServiceStatus: '-',
                requestId: 'api-gw-req-1',
                xrayTraceId: 'Root=1-abcdef01-234567890abcdef012345678',
                path: '/resource-a',
                httpMethod: 'PUT',
              }),
            ];
          }
          return [cwRow({ level: 'ERROR', '@message': 'application error' })];
        },
      },
    } as unknown as ServiceRegistry;

    const runbook = createApiGwAlarmRunbook(
      baseConfig({
        authorizerFailureCheck: {
          defaultAuthorizer: API_GW_AUTHORIZER_LAMBDAS['pn-ioAuthorizerLambda'],
        },
      }),
    );

    const result = await new RunbookEngine(new GOLogger(), new ConditionEvaluator()).execute(
      runbook,
      new Map([
        ['startTime', '2026-01-01T00:00:00.000Z'],
        ['endTime', '2026-01-01T00:10:00.000Z'],
      ]),
      services,
    );

    assert.deepStrictEqual(result.matchedCases, []);
    assert.notStrictEqual(result.resolvedAtStep, 'evaluate-api-gw-authorizer-failure');
    assert.strictEqual(result.finalContext.vars.get('apiGwAuthorizerRequestId'), 'auth-req-2');
    assert.strictEqual(result.finalContext.vars.get('terminationReason'), 'no-match');
    assert.deepStrictEqual(calls, ['/aws/apigw/main', '/aws/ecs/pn-a']);
  });

  it('queries API Gateway execution logs by unique requestId before service traversal', async () => {
    const knownCases: ReadonlyArray<KnownCase> = [
      {
        id: 'execution-known-failure',
        description: 'Execution log known failure',
        priority: 10,
        condition: {
          type: 'contains',
          ref: 'steps.query-api-gw-execution-logs',
          regex: 'ExecutionKnownFailure',
        },
        action: { type: 'log', level: 'info', message: '[CASO NOTO] execution known failure' },
      },
    ];
    const calls: { readonly logGroup: string; readonly query: string }[] = [];
    const services = {
      cloudWatchLogs: {
        query: async (
          logGroups: ReadonlyArray<string>,
          query: string,
        ): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> => {
          await Promise.resolve();
          const logGroup = logGroups[0] ?? '';
          calls.push({ logGroup, query });
          if (logGroup === '/aws/apigw/main') {
            return [
              cwRow({
                status: '500',
                authorizerStatus: '-',
                integrationServiceStatus: '-',
                errorMessage: 'Endpoint request timed out',
                requestId: 'req-a-1',
                path: '/resource-a',
                httpMethod: 'GET',
              }),
              cwRow({
                status: '500',
                authorizerStatus: '-',
                integrationServiceStatus: '-',
                errorMessage: 'Endpoint request timed out',
                requestId: 'req-a-2',
                path: '/resource-a',
                httpMethod: 'GET',
              }),
              cwRow({
                status: '500',
                authorizerStatus: '-',
                integrationServiceStatus: '-',
                errorMessage: 'Endpoint request timed out',
                requestId: 'req-b-1',
                path: '/resource-b',
                httpMethod: 'GET',
              }),
            ];
          }
          if (logGroup === 'API-Gateway-Execution-Logs_test/prod' && query.includes('req-b-1')) {
            return [cwRow({ '@timestamp': '2026-01-01T00:00:01.000Z', '@message': 'ExecutionKnownFailure' })];
          }
          return [cwRow({ '@timestamp': '2026-01-01T00:00:00.000Z', '@message': 'execution detail' })];
        },
      },
    } as unknown as ServiceRegistry;

    const runbook = createApiGwAlarmRunbook(
      baseConfig({
        entryService: {
          name: 'pn-a',
          logGroup: '/aws/ecs/pn-a',
          executionLogGroup: 'API-Gateway-Execution-Logs_test/prod',
          varPrefix: 'a',
        },
        knownCases,
      }),
    );

    const result = await new RunbookEngine(new GOLogger(), new ConditionEvaluator()).execute(
      runbook,
      new Map([
        ['startTime', '2026-01-01T00:00:00.000Z'],
        ['endTime', '2026-01-01T00:10:00.000Z'],
      ]),
      services,
    );

    assert.deepStrictEqual(
      result.matchedCases.map((c) => c.id),
      ['execution-known-failure'],
    );
    assert.strictEqual(result.resolvedAtStep, 'query-api-gw-execution-logs');
    // V04: UNA sola chiamata AWS per N requestId (OR-clause).
    assert.deepStrictEqual(
      calls.map((call) => call.logGroup),
      ['/aws/apigw/main', 'API-Gateway-Execution-Logs_test/prod'],
    );
    // La singola query contiene tutti i requestId unici, anche quando
    // piu' richieste fallite condividono lo stesso endpoint.
    assert.match(calls[1]?.query ?? '', /req-a-1/);
    assert.match(calls[1]?.query ?? '', /req-a-2/);
    assert.match(calls[1]?.query ?? '', /req-b-1/);
  });

  it('stops before the X-Ray flow when execution logs have no matching known case', async () => {
    const calls: string[] = [];
    const services = {
      cloudWatchLogs: {
        query: async (logGroups: ReadonlyArray<string>): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> => {
          await Promise.resolve();
          const logGroup = logGroups[0] ?? '';
          calls.push(logGroup);
          if (logGroup === '/aws/apigw/main') {
            return [
              cwRow({
                status: '500',
                authorizerStatus: '-',
                integrationServiceStatus: '-',
                errorMessage: 'Endpoint request timed out',
                requestId: 'req-a',
                path: '/resource-a',
              }),
            ];
          }
          return [cwRow({ '@timestamp': '2026-01-01T00:00:00.000Z', '@message': 'unknown execution detail' })];
        },
      },
    } as unknown as ServiceRegistry;

    const runbook = createApiGwAlarmRunbook(
      baseConfig({
        entryService: {
          name: 'pn-a',
          logGroup: '/aws/ecs/pn-a',
          executionLogGroup: 'API-Gateway-Execution-Logs_test/prod',
          varPrefix: 'a',
        },
      }),
    );

    const result = await new RunbookEngine(new GOLogger(), new ConditionEvaluator()).execute(
      runbook,
      new Map([
        ['startTime', '2026-01-01T00:00:00.000Z'],
        ['endTime', '2026-01-01T00:10:00.000Z'],
      ]),
      services,
    );

    assert.deepStrictEqual(result.matchedCases, []);
    assert.strictEqual(result.finalContext.vars.get('terminationReason'), 'api-gw-execution-log-unresolved');
    assert.deepStrictEqual(calls, ['/aws/apigw/main', 'API-Gateway-Execution-Logs_test/prod']);
  });

  it('continues with trace-id service traversal when execution-log requestId extraction fails', async () => {
    const calls: string[] = [];
    const services = {
      cloudWatchLogs: {
        query: async (logGroups: ReadonlyArray<string>): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> => {
          await Promise.resolve();
          const logGroup = logGroups[0] ?? '';
          calls.push(logGroup);
          if (logGroup === '/aws/apigw/main') {
            return [
              cwRow({
                status: '500',
                authorizerStatus: '-',
                integrationServiceStatus: '-',
                errorMessage: 'Endpoint request timed out',
                xrayTraceId: 'Root=1-abcdef01-234567890abcdef012345678',
                requestId: '-',
                path: '/resource-a',
              }),
            ];
          }
          if (logGroup === '/aws/ecs/pn-a') {
            return [
              cwRow({
                '@timestamp': '2026-01-01T00:00:01.000Z',
                level: 'ERROR',
                '@message': '1-abcdef01-234567890abcdef012345678 application error',
              }),
            ];
          }
          return [];
        },
      },
    } as unknown as ServiceRegistry;

    const runbook = createApiGwAlarmRunbook(
      baseConfig({
        entryService: {
          name: 'pn-a',
          logGroup: '/aws/ecs/pn-a',
          executionLogGroup: 'API-Gateway-Execution-Logs_test/prod',
          varPrefix: 'a',
        },
      }),
    );

    const result = await new RunbookEngine(new GOLogger(), new ConditionEvaluator()).execute(
      runbook,
      new Map([
        ['startTime', '2026-01-01T00:00:00.000Z'],
        ['endTime', '2026-01-01T00:10:00.000Z'],
      ]),
      services,
    );

    assert.strictEqual(result.finalContext.vars.get('apiGwExecutionLogMode'), 'no-request-id');
    assert.strictEqual(result.finalContext.vars.get('terminationReason'), 'no-match');
    assert.deepStrictEqual(calls, ['/aws/apigw/main', '/aws/ecs/pn-a']);
  });

  it('accepts an entry-only configuration (no additional services)', () => {
    const runbook = createApiGwAlarmRunbook(baseConfig({ services: [] }));
    const stepIds = runbook.steps.map((d) => d.step.id);
    assert.ok(stepIds.includes('query-pn-a'));
    assert.ok(stepIds.includes('decide-pn-a'));
    assert.ok(!stepIds.includes('query-pn-b'));
  });
});
