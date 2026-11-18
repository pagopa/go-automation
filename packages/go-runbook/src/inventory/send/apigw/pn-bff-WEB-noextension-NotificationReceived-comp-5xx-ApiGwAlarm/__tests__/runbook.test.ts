import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { RunbookContext, RunbookExecutionResult } from '../../../../../engine/index.js';
import { buildRunbook } from '../runbook.js';
import { KNOWN_CASES } from '../knownCases.js';
import { API_GW_LOG_GROUP } from '../knownServices.js';
import { NOTIFICATION_RECEIVED_QUERY_PROFILE as PROFILE } from '../queryProfile.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { executeWithLogs } from '../../../../../__tests__/helpers/executeWithLogs.js';
import { caseMatches, knownCaseById } from '../../../../../__tests__/helpers/knownCaseMatching.js';

const ROOT = '1-6ac5cc09-67ca536f1c9e14130fb3b03e';
const BFF_FALLBACK = '11111111-1111-1111-1111-111111111111';
const PAYMENTS_TIMEOUT =
  'Ending process _getPaymentsInfoV1 with errors=nested exception is io.netty.handler.timeout.ReadTimeoutException';
const CHECKOUT_TIMEOUT =
  '[DOWNSTREAM] Service Checkout returned errors=connection timed out after 3000 ms: api.platform.pagopa.it/192.0.2.1:443';
const PAYMENTS_TIME_RANGE = { startTime: '2026-10-07T04:31:55Z', endTime: '2026-10-07T04:41:56Z' };
const row = (values: Record<string, string>): ReadonlyArray<GOLogsInsightsResultField> =>
  Object.entries(values).map(([field, value]) => ({ field, value }));

function context(stepId: string, message: string, vars: Record<string, string> = {}): RunbookContext {
  return createTestContext({
    vars,
    stepResults: { [stepId]: [row({ '@message': JSON.stringify({ stack_trace: message }) })] },
  });
}

function matches(id: string, ctx: RunbookContext): boolean {
  return caseMatches(knownCaseById(KNOWN_CASES, id), ctx);
}

async function executePaymentsTrace(
  checkoutMessage: string | undefined,
  { followCheckout = true, checkoutFails = false, earlierDeliverySuccess = false } = {},
): Promise<{ result: RunbookExecutionResult; calls: ReadonlyArray<string> }> {
  const { result, queries } = await executeWithLogs(buildRunbook(), PAYMENTS_TIME_RANGE, (query, [group = '']) => {
    if (group === API_GW_LOG_GROUP) {
      return [
        row({
          status: '500',
          xrayTraceId: `Root=${ROOT}`,
          requestId: 'payments-request',
          authorizerStatus: '200',
          httpMethod: 'GET',
          resourcePath: '/v1/notifications/received/{iun}/payments/{attachmentName}',
        }),
      ];
    }
    if (group === '/aws/ecs/pn-bff') {
      return [
        ...(earlierDeliverySuccess
          ? [
              row({
                level: 'INFO',
                '@message': 'Invoking external service http://internal.example:8080/delivery/notifications/received',
                trace_id: ROOT,
              }),
              row({ level: 'INFO', '@message': 'Delivery call completed with status 200', trace_id: ROOT }),
            ]
          : []),
        row({
          level: 'ERROR',
          '@message':
            `${PAYMENTS_TIMEOUT}; The connection observed an error; ` +
            'Request to GET http://internal.example:8080/ext-registry-private/payments',
          trace_id: ROOT,
        }),
      ];
    }
    if (group === '/aws/ecs/pn-external-registries') {
      assert.ok(query.includes(ROOT));
      return followCheckout
        ? [
            row({
              level: 'INFO',
              '@message': 'Invoking external service http://pn-external-registries-checkout:8080/checkout/payments',
              trace_id: ROOT,
            }),
          ]
        : [];
    }
    if (group === '/aws/ecs/pn-external-registries-checkout') {
      assert.ok(query.includes(ROOT));
      if (checkoutFails) throw new Error('Checkout logs unavailable');
      return checkoutMessage === undefined ? [] : [row({ level: 'ERROR', '@message': checkoutMessage })];
    }
    return [];
  });
  return { result, calls: queries.map(({ groups }) => groups[0] ?? '') };
}

describe('NotificationReceived WEB diagnosis', () => {
  it('falls back on the request path only for the monitored received-notification routes', () => {
    const query = PROFILE.accessLog.query;
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

  it('defers all BFF symptom fallbacks until traversal has stopped', () => {
    const fixtures = [
      { id: 'bff-payments-info-read-timeout', message: PAYMENTS_TIMEOUT, vars: { externalRegistriesLogCount: '0' } },
      {
        id: 'bff-delivery-read-timeout',
        message: 'ReadTimeoutException Request to GET http://internal.example:8080/delivery/notifications/received',
        vars: { deliveryLogCount: '0' },
      },
      {
        id: 'bff-connection-observed-error',
        message: 'The connection observed an error',
        vars: { externalRegistriesLogCount: '1' },
      },
    ];
    for (const { id, message, vars } of fixtures) {
      assert.strictEqual(matches(id, context('query-pn-bff', message)), false, id);
      for (const terminationReason of [undefined, '']) {
        assert.strictEqual(
          matches(
            id,
            context('query-pn-bff', message, {
              ...vars,
              ...(terminationReason === undefined ? {} : { terminationReason }),
            }),
          ),
          false,
          id,
        );
      }
      assert.strictEqual(
        matches(id, context('query-pn-bff', message, { ...vars, terminationReason: 'no-match' })),
        true,
        id,
      );
    }
  });

  it('traverses BFF to delivery using X-Ray instead of a BFF-only fallback UUID', async () => {
    const { result, draft, queries } = await executeWithLogs(
      buildRunbook(),
      PAYMENTS_TIME_RANGE,
      (query, [group = '']) => {
        if (group === API_GW_LOG_GROUP) {
          return [
            row({
              status: '500',
              xrayTraceId: `Root=${ROOT}`,
              requestId: 'request-1',
              authorizerStatus: '200',
              httpMethod: 'GET',
              path: '/bff/v1/notifications/received',
            }),
          ];
        }
        if (group === '/aws/ecs/pn-bff') {
          return [
            row({
              level: 'ERROR',
              '@message': `pn-exception 500 FALLBACK-UUID:${BFF_FALLBACK} Request to GET http://internal.example:8080/delivery/notifications/received`,
              trace_id: ROOT,
            }),
          ];
        }
        if (group !== '/aws/ecs/pn-delivery') return [];
        assert.ok(query.includes(ROOT));
        assert.ok(!query.includes(BFF_FALLBACK));
        return [
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
      },
    );
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.matchedCases[0]?.id, 'delivery-index-out-of-bounds');
    assert.ok(queries.some(({ groups }) => groups[0] === '/aws/ecs/pn-delivery'));
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(result.finalContext.vars.get('bffFallbackUuid'), BFF_FALLBACK);
  });

  it('reaches checkout and diagnoses its timeout before either BFF fallback can resolve', async () => {
    const { result, calls } = await executePaymentsTrace(CHECKOUT_TIMEOUT);
    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(
      calls.filter((group) => group.startsWith('/aws/ecs/')),
      ['/aws/ecs/pn-bff', '/aws/ecs/pn-external-registries', '/aws/ecs/pn-external-registries-checkout'],
    );
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['checkout-connect-timeout'],
    );
    assert.strictEqual(result.resolvedAtStep, 'analyze-pn-external-registries-checkout');
  });

  it('follows failing external registries through checkout instead of an earlier successful Delivery invocation', async () => {
    const { result, calls } = await executePaymentsTrace(CHECKOUT_TIMEOUT, { earlierDeliverySuccess: true });
    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(
      calls.filter((group) => group.startsWith('/aws/ecs/')),
      ['/aws/ecs/pn-bff', '/aws/ecs/pn-external-registries', '/aws/ecs/pn-external-registries-checkout'],
    );
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['checkout-connect-timeout'],
    );
    assert.strictEqual(result.finalContext.vars.get('bffNextUrlTarget'), 'pn-external-registries');
  });

  it('resolves the BFF timeout only after checkout traversal ends without a specific diagnosis', async () => {
    for (const message of [undefined, 'ERROR - Unrecognized checkout failure']) {
      const { result, calls } = await executePaymentsTrace(message);
      assert.strictEqual(result.status, 'completed');
      assert.ok(calls.includes('/aws/ecs/pn-external-registries-checkout'));
      assert.strictEqual(result.finalContext.vars.get('terminationReason'), 'no-match');
      assert.strictEqual(result.matchedCases[0]?.id, 'bff-payments-info-read-timeout');
      assert.notStrictEqual(result.earlyResolution, true);
    }
  });

  it('keeps the BFF fallback available when external registries has no reachable checkout', async () => {
    const { result, calls } = await executePaymentsTrace(undefined, { followCheckout: false });
    assert.strictEqual(result.status, 'completed');
    assert.ok(!calls.includes('/aws/ecs/pn-external-registries-checkout'));
    assert.strictEqual(result.finalContext.vars.get('terminationReason'), 'no-match');
    assert.strictEqual(result.matchedCases[0]?.id, 'bff-payments-info-read-timeout');
    assert.notStrictEqual(result.earlyResolution, true);
  });

  it('surfaces a failed checkout query instead of resolving the upstream BFF timeout', async () => {
    const { result, calls } = await executePaymentsTrace(undefined, { checkoutFails: true });
    assert.ok(calls.includes('/aws/ecs/pn-external-registries-checkout'));
    assert.strictEqual(result.status, 'failed');
    assert.deepStrictEqual(result.matchedCases, []);
  });
});
