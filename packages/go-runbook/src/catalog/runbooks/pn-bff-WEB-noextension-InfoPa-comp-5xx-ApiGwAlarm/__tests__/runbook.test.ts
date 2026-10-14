import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@go-automation/go-common/core';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { ConditionEvaluator } from '../../framework.js';
import type { RunbookContext } from '../../framework.js';
import { buildRunbook, INFO_PA_ALARM } from '../runbook.js';
import { KNOWN_CASES } from '../knownCases.js';
import { API_GW_LOG_GROUP } from '../knownServices.js';

const ROOT = '1-6abf5ca6-432e6382038c4b060d8e8ddd';
const FALLBACK = '4e88b614-ecc0-4327-86ae-a7b02490ea39';
const BFF_TIMEOUT =
  `pn-exception 500 FALLBACK-UUID:${FALLBACK} ` +
  'Request to GET http://internal.example:8080/ext-registry/pa/v1/institutions/institution-id/products ' +
  'Caused by: io.netty.handler.timeout.ReadTimeoutException: null';
const SELFCARE_TIMEOUT =
  'Request to GET https://api.selfcare.pagopa.it/external/v2/users?userId=user-id ' +
  'Caused by: io.netty.handler.timeout.ReadTimeoutException: null';
const ABORTED = 'Caused by: reactor.netty.channel.AbortedException: Connection has been closed BEFORE send operation';
const COMMITTED =
  'Error [java.lang.UnsupportedOperationException] for HTTP GET "/ext-registry/pa/v1/institutions/institution-id/products", ' +
  'but ServerHttpResponse already committed (200 OK)';

function row(fields: Record<string, string>): { field: string; value: string }[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

function context(messages: ReadonlyArray<string>, queried = true): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date(),
    params: new Map(),
    vars: new Map([
      ['apiGwStatusCode', '500'],
      ['apiGwHttpMethod', 'GET'],
      ['apiGwPath', '/bff/v1/institutions/products'],
      ...(queried ? [['externalRegistriesLogCount', String(messages.length)] as const] : []),
    ]),
    stepResults: new Map([
      ['query-pn-bff', [row({ '@message': JSON.stringify({ message: BFF_TIMEOUT }) })]],
      ['query-pn-external-registries', messages.map((message) => row({ '@message': JSON.stringify({ message }) }))],
    ]),
    services: createTestServiceRegistry(),
    logs: [],
    recoveredErrors: [],
  };
}

function matches(id: string, ctx: RunbookContext): boolean {
  const knownCase = KNOWN_CASES.find((entry) => entry.id === id);
  assert.ok(knownCase);
  return new ConditionEvaluator().evaluate(knownCase.condition, ctx);
}

describe('InfoPa API Gateway runbook', () => {
  it('registers a cloud-executable read-only SEND runbook', () => {
    const entry = RUNBOOK_CATALOG.resolveByAlarmName(INFO_PA_ALARM);
    assert.ok(entry);
    assert.strictEqual(entry.product, 'SEND');
    assert.strictEqual(entry.descriptor.kind, 'APIGW');
    assert.doesNotThrow(() => assertCloudExecutableRunbook(entry.build()));
    assert.ok(KNOWN_CASES.every((entry) => entry.analysis?.proposedStatus === 'IN_PROGRESS'));
  });

  it('does not resolve a BFF timeout before querying the downstream', () => {
    assert.strictEqual(matches('bff-external-registries-read-timeout', context([], false)), false);
    assert.strictEqual(matches('bff-external-registries-read-timeout', context([])), true);
  });

  it('requires endpoint-specific evidence for the documented Selfcare timeout', () => {
    assert.strictEqual(matches('external-registries-selfcare-read-timeout', context([SELFCARE_TIMEOUT])), true);
    for (const message of [
      SELFCARE_TIMEOUT.replace('api.selfcare.pagopa.it', 'other.example'),
      SELFCARE_TIMEOUT.replace('ReadTimeoutException', 'ReadTimeoutExceptionOther'),
      'io.netty.handler.timeout.ReadTimeoutException',
    ]) {
      assert.strictEqual(matches('external-registries-selfcare-read-timeout', context([message])), false);
    }
  });

  it('recognizes retry timeouts only with correlated failed Selfcare telemetry', () => {
    const failure = JSON.stringify({
      eventType: 'downstream_http_call',
      url: 'https://api.selfcare.pagopa.it/external/v2/institutions/institution-id/products',
      outcome: 'ERROR',
      errorType: 'WebClientRequestException',
    });
    const retry = 'Exception caught by retry; Caused by: io.netty.handler.timeout.ReadTimeoutException: null';
    assert.strictEqual(matches('external-registries-selfcare-read-timeout', context([failure, retry])), true);
    assert.strictEqual(matches('external-registries-selfcare-read-timeout', context([failure])), false);
    assert.strictEqual(matches('external-registries-selfcare-read-timeout', context([retry])), false);
  });

  it('requires the complete committed-response signature and the upstream timeout', () => {
    assert.strictEqual(matches('external-registries-response-already-committed', context([ABORTED, COMMITTED])), true);
    assert.strictEqual(matches('external-registries-response-already-committed', context([ABORTED])), false);
    assert.strictEqual(matches('external-registries-response-already-committed', context([COMMITTED])), false);
    const ctx = context([ABORTED, COMMITTED]);
    const stepResults = new Map(ctx.stepResults);
    stepResults.set('query-pn-bff', []);
    assert.strictEqual(matches('external-registries-response-already-committed', { ...ctx, stepResults }), false);
  });

  it('traverses using the X-Ray root when BFF and downstream fallback UUIDs differ', async () => {
    const calls: string[] = [];
    const services = createTestServiceRegistry({
      cloudWatchLogs: {
        query: async (groups: ReadonlyArray<string>, query: string) => {
          await Promise.resolve();
          const group = groups[0] ?? '';
          calls.push(group);
          if (group === API_GW_LOG_GROUP) {
            return Promise.resolve([
              row({
                status: '500',
                xrayTraceId: `Root=${ROOT}`,
                requestId: 'request-id',
                httpMethod: 'GET',
                path: '/bff/v1/institutions/products',
                errorMessage: '-',
                authorizerStatus: '200',
              }),
            ]);
          }
          if (group === '/aws/ecs/pn-bff') {
            return Promise.resolve([row({ level: 'ERROR', '@message': BFF_TIMEOUT, trace_id: ROOT })]);
          }
          assert.strictEqual(group, '/aws/ecs/pn-external-registries');
          assert.ok(query.includes(ROOT));
          assert.ok(!query.includes(FALLBACK));
          return Promise.resolve([row({ level: 'ERROR', '@message': SELFCARE_TIMEOUT, trace_id: ROOT })]);
        },
      },
    });
    const result = await new RunbookEngine(new GOLogger()).execute(
      buildRunbook(),
      new Map([
        ['startTime', '2026-10-02T07:22:00Z'],
        ['endTime', '2026-10-02T07:33:00Z'],
      ]),
      services,
    );
    assert.deepStrictEqual(calls, [API_GW_LOG_GROUP, '/aws/ecs/pn-bff', '/aws/ecs/pn-external-registries']);
    assert.strictEqual(result.matchedCases[0]?.id, 'external-registries-selfcare-read-timeout');
    assert.strictEqual(result.finalContext.vars.get('bffFallbackUuid'), FALLBACK);
  });
});
