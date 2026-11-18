import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RunbookContext } from '../../../../../engine/index.js';
import { buildRunbook } from '../runbook.js';
import { KNOWN_CASES } from '../knownCases.js';
import { API_GW_LOG_GROUP } from '../knownServices.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { executeWithLogs } from '../../../../../__tests__/helpers/executeWithLogs.js';
import { caseMatches, knownCaseById } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';

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

function context(messages: ReadonlyArray<string>, queried = true): RunbookContext {
  return createTestContext({
    vars: {
      apiGwStatusCode: '500',
      apiGwHttpMethod: 'GET',
      apiGwPath: '/bff/v1/institutions/products',
      ...(queried ? { externalRegistriesLogCount: String(messages.length) } : {}),
    },
    stepResults: {
      'query-pn-bff': [logRow({ '@message': JSON.stringify({ message: BFF_TIMEOUT }) })],
      'query-pn-external-registries': messages.map((message) => logRow({ '@message': JSON.stringify({ message }) })),
    },
  });
}

function matches(id: string, ctx: RunbookContext): boolean {
  return caseMatches(knownCaseById(KNOWN_CASES, id), ctx);
}

describe('InfoPa API Gateway runbook', () => {
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

  it('requires the complete correlated groups/invalid-tenant signature observed on September 1', () => {
    const bff =
      'WebClientResponseException$InternalServerError: 500 Internal Server Error from GET http://internal.example:8080/ext-registry/pa/v1/groups';
    const failure =
      '[DOWNSTREAM] Service SelfcarePA returned errors=400 Bad Request from GET https://api.selfcare.pagopa.it/external/v2/user-groups: {"detail":"Invalid tenant context"}';
    const ctx = context([failure]);
    const steps = new Map(ctx.stepResults);
    steps.set('query-pn-bff', [logRow({ '@message': bff })]);
    const vars = new Map(ctx.vars);
    vars.set('apiGwPath', '/bff/v1/pa/groups');
    const correlated = { ...ctx, vars, stepResults: steps };
    const id = 'selfcare-user-groups-invalid-tenant-context';
    assert.equal(matches(id, correlated), true);
    assert.equal(
      matches(id, { ...correlated, vars: new Map([...vars, ['apiGwPath', '/bff/v1/institutions']]) }),
      false,
    );
    assert.equal(matches(id, { ...correlated, stepResults: new Map([...steps, ['query-pn-bff', []]]) }), false);
    for (const unrelated of [
      failure.replace('api.selfcare.pagopa.it', 'other.example'),
      failure.replace('user-groups', 'users'),
      failure.replace('Invalid tenant context', 'Another error'),
      failure.replace('400 Bad Request', '500 Internal Server Error'),
    ]) {
      assert.equal(
        matches(id, {
          ...correlated,
          stepResults: new Map([...steps, ['query-pn-external-registries', [logRow({ '@message': unrelated })]]]),
        }),
        false,
      );
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
    const { result, queries } = await executeWithLogs(
      buildRunbook(),
      { startTime: '2026-10-02T07:22:00Z', endTime: '2026-10-02T07:33:00Z' },
      (query, [group = '']) => {
        if (group === API_GW_LOG_GROUP) {
          return [
            logRow({
              status: '500',
              xrayTraceId: `Root=${ROOT}`,
              requestId: 'request-id',
              httpMethod: 'GET',
              path: '/bff/v1/institutions/products',
              errorMessage: '-',
              authorizerStatus: '200',
            }),
          ];
        }
        if (group === '/aws/ecs/pn-bff') return [logRow({ level: 'ERROR', '@message': BFF_TIMEOUT, trace_id: ROOT })];
        assert.strictEqual(group, '/aws/ecs/pn-external-registries');
        assert.ok(query.includes(ROOT));
        assert.ok(!query.includes(FALLBACK));
        return [logRow({ level: 'ERROR', '@message': SELFCARE_TIMEOUT, trace_id: ROOT })];
      },
    );
    assert.deepStrictEqual(
      queries.map(({ groups }) => groups[0]),
      [API_GW_LOG_GROUP, '/aws/ecs/pn-bff', '/aws/ecs/pn-external-registries'],
    );
    assert.strictEqual(result.matchedCases[0]?.id, 'external-registries-selfcare-read-timeout');
    assert.strictEqual(result.finalContext.vars.get('bffFallbackUuid'), FALLBACK);
  });
});
