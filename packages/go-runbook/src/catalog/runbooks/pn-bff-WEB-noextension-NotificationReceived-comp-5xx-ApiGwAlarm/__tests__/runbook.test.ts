import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { ConditionEvaluator, type RunbookContext } from '../../framework.js';
import { buildRunbook } from '../runbook.js';
import { KNOWN_CASES } from '../knownCases.js';
import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES } from '../knownServices.js';
import { NOTIFICATION_RECEIVED_QUERY_PROFILE as PROFILE } from '../queryProfile.js';

const ROOT = '1-6ac5cc09-67ca536f1c9e14130fb3b03e';
const BFF_FALLBACK = '11111111-1111-1111-1111-111111111111';
const ALARM = 'pn-bff-WEB-noextension-NotificationReceived-comp-5xx-ApiGwAlarm';
const row = (values: Record<string, string>): ReadonlyArray<ResultField> =>
  Object.entries(values).map(([field, value]) => ({ field, value }));

function context(stepId: string, message: string, vars: Record<string, string> = {}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date(),
    params: new Map(),
    vars: new Map(Object.entries(vars)),
    stepResults: new Map([[stepId, [row({ '@message': JSON.stringify({ stack_trace: message }) })]]]),
    services: createTestServiceRegistry(),
    logs: [],
    recoveredErrors: [],
  };
}

function matches(id: string, ctx: RunbookContext): boolean {
  const candidate = KNOWN_CASES.find((entry) => entry.id === id);
  assert.ok(candidate);
  return new ConditionEvaluator().evaluate(candidate.condition, ctx);
}

describe('NotificationReceived WEB diagnosis', () => {
  it('registers a read-only SEND runbook with its Confluence reference and warning evidence', () => {
    const entry = RUNBOOK_CATALOG.resolveByAlarmName(ALARM);
    assert.ok(entry);
    assert.strictEqual(entry.product, 'SEND');
    assert.strictEqual(entry.descriptor.kind, 'APIGW');
    assert.doesNotThrow(() => assertCloudExecutableRunbook(entry.build()));
    assert.ok(KNOWN_CASES.every(({ analysis }) => analysis?.proposedStatus === 'IN_PROGRESS'));
    assert.ok(buildRunbook().analysisDefaults?.links?.some(({ url }) => url.includes('/2112749584/')));
    for (const service of [ENTRY_SERVICE, ...REACHABLE_SERVICES]) {
      assert.ok(service.queryOverride?.includes("level = 'WARN'"));
      assert.ok(service.queryOverride?.includes('Invoking external service'));
    }
  });

  it('limits the access scan to the eight monitored method/resource combinations', () => {
    const query = PROFILE.accessLog.query;
    for (const route of [
      '/v1/notifications/received',
      '/v1/notifications/received/delegated',
      '/v1/notifications/received/{iun}',
      '/v1/notifications/received/{iun}/timeline',
      '/v1/notifications/received/{iun}/documents/{documentType}',
      '/v1/notifications/received/{iun}/payments/{attachmentName}',
      '/v1/notifications/received/check-tpp',
      '/v1/notifications/received/check-aar-qr-code',
    ]) {
      assert.ok(query.includes(`'${route}'`), route);
    }
    assert.ok(query.includes("httpMethod = 'GET'"));
    assert.ok(query.includes("httpMethod = 'POST'"));
    assert.ok(query.indexOf('resourcePath in') < query.indexOf('| limit'));
    assert.ok(query.includes('not ispresent(resourcePath)'));
    assert.ok(query.includes('path not like /\\/check-aar-qr-code$/'));
    const start = query.indexOf('path like /') + 'path like /'.length;
    const end = query.indexOf('$/', start) + 1;
    const fallback = new RegExp(query.slice(start, end), 'u');
    for (const path of [
      '/bff/v1/notifications/received',
      '/v1/notifications/received/delegated',
      '/bff/v1/notifications/received/IUN/documents/LEGAL_FACT',
    ])
      assert.ok(fallback.test(path));
    for (const path of [
      '/bff/v1/institutions',
      '/bff/v1/notifications/sent',
      '/bff/v2/notifications/received',
      '/other/v1/notifications/received',
    ])
      assert.strictEqual(fallback.test(path), false);
  });

  it('recognizes the actual delivery stack-trace signature with changing collection lengths', () => {
    for (const length of [53, 54]) {
      const message = `it.pagopa.pn.commons.exceptions.PnInternalException: Internal Server Error; nested exception is java.lang.IndexOutOfBoundsException: Index -1 out of bounds for length ${length}`;
      assert.strictEqual(matches('delivery-index-out-of-bounds', context('query-pn-delivery', message)), true);
      assert.strictEqual(matches('delivery-index-out-of-bounds', context('query-pn-bff', message)), false);
    }
    assert.strictEqual(
      matches(
        'delivery-index-out-of-bounds',
        context('query-pn-delivery', 'java.lang.IndexOutOfBoundsException: Index 1 out of bounds for length 2'),
      ),
      false,
    );
  });

  it('recognizes documented date and DynamoDB errors without treating database 400 as API Gateway status', () => {
    assert.strictEqual(
      matches(
        'delivery-dynamodb-filter-expression-too-large',
        context(
          'query-pn-delivery',
          'software.amazon.awssdk.services.dynamodb.model.DynamoDbException: Invalid FilterExpression: Expression size has exceeded the maximum allowed size; expression size: 4223 (Status Code: 400)',
        ),
      ),
      true,
    );
    assert.strictEqual(
      matches(
        'delivery-date-range-reversed',
        context(
          'query-pn-delivery',
          "java.lang.IllegalArgumentException: Start (YearAndMonth(year=2025, month=10)) can't be after end (YearAndMonth(year=2024, month=12))",
        ),
      ),
      true,
    );
  });

  it('requires the full correlated Data Vault or Checkout failure signature', () => {
    const vault =
      'org.springframework.web.client.ResourceAccessException: I/O error on GET http://alb.confidential.pn.internal:8080/datavault-private/v1/recipients/internal; java.net.SocketTimeoutException: Read timed out';
    assert.strictEqual(matches('delivery-data-vault-read-timeout', context('query-pn-delivery', vault)), true);
    assert.strictEqual(
      matches('delivery-data-vault-read-timeout', context('query-pn-delivery', 'Exception caught by retry')),
      false,
    );
    const checkout =
      '[DOWNSTREAM] Service Checkout returned errors=connection timed out after 3000 ms: api.platform.pagopa.it/192.0.2.1:443';
    assert.strictEqual(
      matches('checkout-connect-timeout', context('query-pn-external-registries-checkout', checkout)),
      true,
    );
    assert.strictEqual(
      matches(
        'checkout-connect-timeout',
        context(
          'query-pn-external-registries-checkout',
          checkout.replace('api.platform.pagopa.it', 'unrelated.example'),
        ),
      ),
      false,
    );
  });

  it('does not end the BFF analysis before the relevant service was queried', () => {
    const payment =
      'Ending process _getPaymentsInfoV1 with errors=nested exception is io.netty.handler.timeout.ReadTimeoutException';
    assert.strictEqual(matches('bff-payments-info-read-timeout', context('query-pn-bff', payment)), false);
    assert.strictEqual(
      matches('bff-payments-info-read-timeout', context('query-pn-bff', payment, { externalRegistriesLogCount: '0' })),
      true,
    );
    assert.strictEqual(
      matches('bff-connection-observed-error', context('query-pn-bff', 'The connection observed an error')),
      false,
    );
  });

  it('traverses BFF to delivery using X-Ray instead of a BFF-only fallback UUID', async () => {
    const calls: string[] = [];
    const cloudWatchLogs = {
      async queryWithStatistics(groups: ReadonlyArray<string>, query: string): Promise<AWSCloudWatchLogsQueryResult> {
        await Promise.resolve();
        const group = groups[0] ?? '';
        calls.push(group);
        let rows: ReadonlyArray<ReadonlyArray<ResultField>> = [];
        if (group === API_GW_LOG_GROUP)
          rows = [
            row({
              status: '500',
              xrayTraceId: `Root=${ROOT}`,
              requestId: 'request-1',
              authorizerStatus: '200',
              httpMethod: 'GET',
              path: '/bff/v1/notifications/received',
            }),
          ];
        else if (group === '/aws/ecs/pn-bff')
          rows = [
            row({
              level: 'ERROR',
              '@message': `pn-exception 500 FALLBACK-UUID:${BFF_FALLBACK} Request to GET http://internal.example:8080/delivery/notifications/received`,
              trace_id: ROOT,
            }),
          ];
        else if (group === '/aws/ecs/pn-delivery') {
          assert.ok(query.includes(ROOT));
          assert.ok(!query.includes(BFF_FALLBACK));
          rows = [
            row({
              level: 'ERROR',
              '@message': JSON.stringify({
                message: 'pn-exception 500',
                stack_trace:
                  'PnInternalException: java.lang.IndexOutOfBoundsException: Index -1 out of bounds for length 54',
                trace_id: ROOT,
              }),
            }),
          ];
        }
        return {
          rows,
          statistics: { recordsMatched: rows.length, recordsScanned: rows.length, bytesScanned: 1 },
          queryExecutions: [],
        };
      },
    };
    const runbook = buildRunbook();
    const result = await new RunbookEngine(new GOLogger()).execute(
      runbook,
      new Map([
        ['startTime', '2026-10-07T04:31:55Z'],
        ['endTime', '2026-10-07T04:41:56Z'],
      ]),
      createTestServiceRegistry({ cloudWatchLogs }),
    );
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.matchedCases[0]?.id, 'delivery-index-out-of-bounds');
    assert.ok(calls.includes('/aws/ecs/pn-delivery'));
    const draft = buildAnalysisDraft(runbook, result);
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.ok(draft.links.some(({ url }) => url.endsWith('/PN-21515')));
    assert.strictEqual(result.finalContext.vars.get('bffFallbackUuid'), BFF_FALLBACK);
  });
});
