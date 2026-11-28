import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { RunbookContext, RunbookExecutionResult } from '../../../../../engine/index.js';
import { buildRunbook } from '../runbook.js';
import { KNOWN_ERRORS } from '../knownErrors.js';
import { API_GW_LOG_GROUP } from '../knownServices.js';
import { NOTIFICATION_RECEIVED_QUERY_PROFILE as PROFILE } from '../queryProfile.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { executeWithLogs } from '../../../../../__tests__/helpers/executeWithLogs.js';
import { caseMatches, knownErrorById } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { treeNodeVars } from '../../../../../__tests__/helpers/treeNodeVars.js';

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
  return caseMatches(knownErrorById(KNOWN_ERRORS, id), ctx);
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
      return checkoutMessage === undefined
        ? []
        : [row({ level: 'ERROR', '@message': checkoutMessage, trace_id: ROOT })];
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
      assert.strictEqual(
        matches('SEND_APIGW_PBWEBNNRC5AGA_DEL-IND-OUT-OF-BOU', context('query-pn-delivery', message)),
        true,
      );
      assert.strictEqual(
        matches('SEND_APIGW_PBWEBNNRC5AGA_DEL-IND-OUT-OF-BOU', context('query-pn-bff', message)),
        false,
      );
    }
    assert.strictEqual(
      matches(
        'SEND_APIGW_PBWEBNNRC5AGA_DEL-IND-OUT-OF-BOU',
        context('query-pn-delivery', 'java.lang.IndexOutOfBoundsException: Index 1 out of bounds for length 2'),
      ),
      false,
    );
  });

  it('recognizes documented date and DynamoDB errors without treating database 400 as API Gateway status', () => {
    assert.strictEqual(
      matches(
        'SEND_APIGW_PBWEBNNRC5AGA_DEL-DYN-FIL-EXP-TOO-LAR',
        context(
          'query-pn-delivery',
          'software.amazon.awssdk.services.dynamodb.model.DynamoDbException: Invalid FilterExpression: Expression size has exceeded the maximum allowed size; expression size: 4223 (Status Code: 400)',
        ),
      ),
      true,
    );
    assert.strictEqual(
      matches(
        'SEND_APIGW_PBWEBNNRC5AGA_DEL-DAT-RAN-REV',
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
    assert.strictEqual(
      matches('SEND_APIGW_PBWEBNNRC5AGA_DEL-DAT-VAU-REA-TIM', context('query-pn-delivery', vault)),
      true,
    );
    assert.strictEqual(
      matches(
        'SEND_APIGW_PBWEBNNRC5AGA_DEL-DAT-VAU-REA-TIM',
        context('query-pn-delivery', 'Exception caught by retry'),
      ),
      false,
    );
    const checkout =
      '[DOWNSTREAM] Service Checkout returned errors=connection timed out after 3000 ms: api.platform.pagopa.it/192.0.2.1:443';
    assert.strictEqual(
      matches('SEND_APIGW_PBWEBNNRC5AGA_CHE-CON-TIM', context('query-pn-external-registries-checkout', checkout)),
      true,
    );
    assert.strictEqual(
      matches(
        'SEND_APIGW_PBWEBNNRC5AGA_CHE-CON-TIM',
        context(
          'query-pn-external-registries-checkout',
          checkout.replace('api.platform.pagopa.it', 'unrelated.example'),
        ),
      ),
      false,
    );
  });

  it('keeps the BFF symptom fallbacks for a complete branch below without diagnosis', () => {
    const fixtures = [
      {
        id: 'SEND_APIGW_PBWEBNNRC5AGA_BFF-PAY-INF-REA-TIM',
        message: PAYMENTS_TIMEOUT,
        vars: { externalRegistriesLogCount: '0' },
      },
      {
        id: 'SEND_APIGW_PBWEBNNRC5AGA_BFF-DEL-REA-TIM',
        message: 'ReadTimeoutException Request to GET http://internal.example:8080/delivery/notifications/received',
        vars: { deliveryLogCount: '0' },
      },
      {
        id: 'SEND_APIGW_PBWEBNNRC5AGA_BFF-CON-OBS-ERR',
        message: 'The connection observed an error',
        vars: { externalRegistriesLogCount: '1' },
      },
    ];
    for (const { id, message, vars } of fixtures) {
      assert.strictEqual(matches(id, context('query-pn-bff', message)), false, id);
      // A diagnosis below, or a branch interrupted or incomplete, is never covered by the BFF symptom.
      for (const branchOutcome of [undefined, 'diagnosed', 'incomplete']) {
        assert.strictEqual(
          matches(
            id,
            context('query-pn-bff', message, { ...vars, ...(branchOutcome === undefined ? {} : { branchOutcome }) }),
          ),
          false,
          id,
        );
      }
      assert.strictEqual(
        matches(id, context('query-pn-bff', message, { ...vars, branchOutcome: 'undiagnosed' })),
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
    assert.strictEqual(result.detections[0]?.knownError.code, 'SEND_APIGW_PBWEBNNRC5AGA_DEL-IND-OUT-OF-BOU');
    assert.ok(queries.some(({ groups }) => groups[0] === '/aws/ecs/pn-delivery'));
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(treeNodeVars(result, 'pn-bff').get('bffFallbackUuid'), BFF_FALLBACK);
  });

  it('reaches checkout and reports its timeout together with the BFF errors of the same request', async () => {
    const { result, calls } = await executePaymentsTrace(CHECKOUT_TIMEOUT);
    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(
      calls.filter((group) => group.startsWith('/aws/ecs/')),
      ['/aws/ecs/pn-bff', '/aws/ecs/pn-external-registries', '/aws/ecs/pn-external-registries-checkout'],
    );
    // The checkout timeout below explains the BFF error: its symptom cases need a branch without diagnosis.
    assert.deepStrictEqual(
      result.detections.map(({ knownError }) => knownError.code),
      ['SEND_APIGW_PBWEBNNRC5AGA_CHE-CON-TIM'],
    );
    assert.strictEqual(treeNodeVars(result, 'pn-bff').get('branchOutcome'), 'diagnosed');
  });

  it('follows failing external registries through checkout instead of an earlier successful Delivery invocation', async () => {
    const { result, calls } = await executePaymentsTrace(CHECKOUT_TIMEOUT, { earlierDeliverySuccess: true });
    assert.strictEqual(result.status, 'completed');
    // The error follows external registries to checkout; the earlier INFO invocation of Delivery is a route of the
    // request, read once, without errors.
    assert.deepStrictEqual(
      calls.filter((group) => group.startsWith('/aws/ecs/')),
      [
        '/aws/ecs/pn-bff',
        '/aws/ecs/pn-delivery',
        '/aws/ecs/pn-external-registries',
        '/aws/ecs/pn-external-registries-checkout',
      ],
    );
    assert.deepStrictEqual(
      result.detections.map(({ knownError }) => knownError.code),
      ['SEND_APIGW_PBWEBNNRC5AGA_CHE-CON-TIM'],
    );
    assert.strictEqual(treeNodeVars(result, 'pn-bff').get('bffNextUrlTarget'), 'pn-external-registries');
  });

  it('resolves the BFF timeout only after checkout traversal ends without a specific diagnosis', async () => {
    for (const message of [undefined, 'ERROR - Unrecognized checkout failure']) {
      const { result, calls } = await executePaymentsTrace(message);
      assert.strictEqual(result.status, 'completed');
      assert.ok(calls.includes('/aws/ecs/pn-external-registries-checkout'));
      assert.strictEqual(treeNodeVars(result, 'pn-bff').get('branchOutcome'), 'undiagnosed');
      assert.strictEqual(result.detections[0]?.knownError.code, 'SEND_APIGW_PBWEBNNRC5AGA_BFF-PAY-INF-REA-TIM');
    }
  });

  it('keeps the BFF fallback available when external registries has no reachable checkout', async () => {
    const { result, calls } = await executePaymentsTrace(undefined, { followCheckout: false });
    assert.strictEqual(result.status, 'completed');
    assert.ok(!calls.includes('/aws/ecs/pn-external-registries-checkout'));
    assert.strictEqual(treeNodeVars(result, 'pn-bff').get('branchOutcome'), 'undiagnosed');
    assert.strictEqual(result.detections[0]?.knownError.code, 'SEND_APIGW_PBWEBNNRC5AGA_BFF-PAY-INF-REA-TIM');
  });

  it('surfaces a failed checkout query instead of resolving the upstream BFF timeout', async () => {
    const { result, calls } = await executePaymentsTrace(undefined, { checkoutFails: true });
    assert.ok(calls.includes('/aws/ecs/pn-external-registries-checkout'));
    // The evidence read before the failure stays; the checkout read is declared unavailable, so the run is inconclusive.
    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(result.detections, []);
    assert.deepStrictEqual(
      result.coverage.map(({ stepId, reason }) => ({ stepId, reason })),
      [{ stepId: 'query-pn-external-registries-checkout', reason: 'unavailable' }],
    );
  });
});
