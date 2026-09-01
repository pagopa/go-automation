import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';

import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { ConditionEvaluator } from '../../../../core/ConditionEvaluator.js';
import type { ServiceRegistry } from '../../../../services/ServiceRegistry.js';

import { DELIVERY_API_GW_EXECUTION_LOG_GROUP } from '../../constants.js';
import { buildRunbook } from '../runbook.js';
import { API_GW_LOG_GROUP } from '../knownServices.js';
import { createTestServiceRegistry } from '../../../../services/createTestServiceRegistry.js';

type EvidenceKind =
  | 'timeout-empty-execution'
  | 'timeout-expired-execution'
  | 'external-registries-selfcare-timeout'
  | 'external-registries-connection-aborted'
  | 'f24-gone'
  | 'missing-payment'
  | 'selfcare-500';

interface RealOccurrence {
  readonly firedAt: string;
  readonly kind: EvidenceKind;
  readonly expectedCaseId: string;
}

const REAL_OCCURRENCES: ReadonlyArray<RealOccurrence> = [
  {
    firedAt: '2026-08-28T03:39:34.634Z',
    kind: 'timeout-empty-execution',
    expectedCaseId: 'apigw-endpoint-timeout-no-delivery-logs',
  },
  {
    firedAt: '2026-08-23T21:08:34.728Z',
    kind: 'timeout-empty-execution',
    expectedCaseId: 'apigw-endpoint-timeout-no-delivery-logs',
  },
  {
    firedAt: '2026-08-23T02:40:34.686Z',
    kind: 'timeout-empty-execution',
    expectedCaseId: 'apigw-endpoint-timeout-no-delivery-logs',
  },
  {
    firedAt: '2026-08-14T10:23:36.004Z',
    kind: 'timeout-expired-execution',
    expectedCaseId: 'apigw-endpoint-timeout-no-delivery-logs',
  },
  {
    firedAt: '2026-08-11T07:35:30.208Z',
    kind: 'f24-gone',
    expectedCaseId: 'pn-f24-safe-storage-metadata-gone',
  },
  {
    firedAt: '2026-08-10T09:41:30.242Z',
    kind: 'missing-payment',
    expectedCaseId: 'delivery-missing-payment-attachment-index',
  },
  {
    firedAt: '2026-08-09T14:53:33.687Z',
    kind: 'external-registries-selfcare-timeout',
    expectedCaseId: 'external-registries-selfcarepg-read-timeout',
  },
  {
    firedAt: '2026-08-09T08:44:29.821Z',
    kind: 'external-registries-connection-aborted',
    expectedCaseId: 'external-registries-connection-aborted',
  },
  {
    firedAt: '2026-08-07T08:14:12.902Z',
    kind: 'f24-gone',
    expectedCaseId: 'pn-f24-safe-storage-metadata-gone',
  },
  {
    firedAt: '2026-08-05T10:31:49.963Z',
    kind: 'selfcare-500',
    expectedCaseId: 'data-vault-selfcarepg-500',
  },
];

function row(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

function assertNever(value: never): never {
  throw new Error(`Unsupported evidence kind: ${String(value)}`);
}

function accessLogRow(kind: EvidenceKind): ResultField[] {
  const common = {
    authorizerStatus: '200',
    authorizerLatency: '0',
    integrationServiceStatus: '-',
    requestId: `request-${kind}`,
    xrayTraceId: 'Root=1-6a7593ba-7496b2865ca36ac86dcb98e3',
    httpMethod: 'GET',
  };

  switch (kind) {
    case 'timeout-empty-execution':
    case 'timeout-expired-execution':
    case 'external-registries-selfcare-timeout':
    case 'external-registries-connection-aborted':
      return row({
        ...common,
        status: '504',
        errorMessage: 'Endpoint request timed out',
        path: '/delivery/v2.7/notifications/sent/IUN',
      });
    case 'f24-gone':
      return row({
        ...common,
        status: '500',
        errorMessage: '-',
        path: '/delivery/notifications/sent/IUN/attachments/payment/0/F24',
      });
    case 'missing-payment':
      return row({
        ...common,
        status: '500',
        errorMessage: '-',
        path: '/delivery/notifications/sent/IUN/attachments/payment/0/PAGOPA',
      });
    case 'selfcare-500':
      return row({
        ...common,
        status: '500',
        errorMessage: '-',
        httpMethod: 'POST',
        path: '/delivery/v2.3/requests',
      });
    default:
      return assertNever(kind);
  }
}

function deliveryRows(kind: EvidenceKind): ReadonlyArray<ReadonlyArray<ResultField>> {
  switch (kind) {
    case 'timeout-empty-execution':
    case 'timeout-expired-execution':
      return [];
    case 'external-registries-selfcare-timeout':
    case 'external-registries-connection-aborted':
      return [
        row({
          level: 'ERROR',
          '@message':
            'Error during retrieve of the groups - ResourceAccessException: I/O error on GET request for ' +
            'http://internal.example:8080/ext-registry-private/pa/v1/groups-all: Read timed out; ' +
            'nested exception is java.net.SocketTimeoutException: Read timed out',
          trace_id: '1-6a7593ba-7496b2865ca36ac86dcb98e3',
        }),
      ];
    case 'f24-gone':
      return [
        row({
          level: 'ERROR',
          '@message':
            'Error in call url=http://internal.example:8080/f24-private/pdf/IUN?pathTokens=0%2C0&cost=560 ' +
            'method=GET statusCode=500 INTERNAL_SERVER_ERROR and body={"detail":"See logs for details in PN-F24"}',
          trace_id: '1-6a7593ba-7496b2865ca36ac86dcb98e3',
        }),
      ];
    case 'missing-payment':
      return [
        row({
          level: 'ERROR',
          '@message':
            '[AUD_NT_ATCHOPEN_SND] FAILURE - Notification without payment attachment index - ' +
            'code: PN_DELIVERY_NOTIFICATIONWITHOUTPAYMENTATTACHMENT',
          trace_id: '1-6a7593ba-7496b2865ca36ac86dcb98e3',
        }),
      ];
    case 'selfcare-500':
      return [
        row({
          level: 'ERROR',
          '@message':
            'Error in call url=http://internal.example:8080/datavault-private/v1/recipients/external/PG ' +
            'method=POST statusCode=500 body={"traceId":"FALLBACK-UUID:ebf9ee53-54bb-4ef2-89a3-850773eb8214"}',
          trace_id: '1-6a7593ba-7496b2865ca36ac86dcb98e3',
        }),
      ];
    default:
      return assertNever(kind);
  }
}

function createServices(kind: EvidenceKind, calls: string[]): ServiceRegistry {
  return createTestServiceRegistry({
    cloudWatchLogs: {
      query: async (logGroups: ReadonlyArray<string>): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> => {
        await Promise.resolve();
        const logGroup = logGroups[0] ?? '';
        calls.push(logGroup);

        if (logGroup === API_GW_LOG_GROUP) return [accessLogRow(kind)];
        if (logGroup === DELIVERY_API_GW_EXECUTION_LOG_GROUP) {
          if (
            kind === 'timeout-expired-execution' ||
            kind === 'external-registries-selfcare-timeout' ||
            kind === 'external-registries-connection-aborted'
          ) {
            throw new Error('MalformedQueryException: time range exceeds the log groups log retention settings');
          }
          return [];
        }
        if (logGroup === '/aws/ecs/pn-delivery') return deliveryRows(kind);
        if (logGroup === '/aws/ecs/pn-external-registries') {
          if (kind === 'external-registries-selfcare-timeout') {
            return [
              row({
                level: 'ERROR',
                '@message':
                  'pn-exception 500 catched problem=class Problem { title: Internal Server Error }\n' +
                  'Error has been observed at the following site(s):\n' +
                  '*__checkpoint ⇢ Request to GET https://api.selfcare.pagopa.it/external/v2/user-groups ' +
                  '[DefaultWebClient]\n' +
                  'Caused by: io.netty.handler.timeout.ReadTimeoutException: null',
                trace_id: '6a7593ba7496b2865ca36ac86dcb98e3',
              }),
            ];
          }
          if (kind === 'external-registries-connection-aborted') {
            return [
              row({
                level: 'ERROR',
                '@message':
                  'pn-exception 500 catched problem=class Problem { title: Internal Server Error }\n' +
                  'Caused by: reactor.netty.channel.AbortedException: ' +
                  'Connection has been closed BEFORE send operation',
                trace_id: '6a7593ba7496b2865ca36ac86dcb98e3',
              }),
            ];
          }
        }
        if (logGroup === '/aws/ecs/pn-f24' && kind === 'f24-gone') {
          return [
            row({
              level: 'ERROR',
              '@message':
                'WebClientResponseException$Gone: 410 Gone from GET ' +
                'http://vpce.example:8080/safe-storage/v1/files/PN_F24_META-id.json',
              trace_id: '1-6a7593ba-7496b2865ca36ac86dcb98e3',
            }),
          ];
        }
        if (logGroup === '/aws/ecs/pn-data-vault-sep' && kind === 'selfcare-500') {
          return [
            row({
              level: 'ERROR',
              '@message':
                '[DOWNSTREAM] Service SelfcarePG returned errors=500 Internal Server Error from POST ' +
                'https://api.selfcare.pagopa.it/external/data-vault/v1/pn-pg/institutions/add',
              trace_id: '6a7593ba7496b2865ca36ac86dcb98e3',
            }),
          ];
        }
        return [];
      },
    },
  });
}

describe('pn-delivery-B2B real occurrence regressions', () => {
  for (const occurrence of REAL_OCCURRENCES) {
    it(`${occurrence.firedAt} resolves as ${occurrence.expectedCaseId}`, async () => {
      const calls: string[] = [];
      const firedAt = new Date(occurrence.firedAt);
      const result = await new RunbookEngine(new GOLogger(), new ConditionEvaluator()).execute(
        buildRunbook(),
        new Map([
          ['startTime', new Date(firedAt.getTime() - 10 * 60_000).toISOString()],
          ['endTime', new Date(firedAt.getTime() + 5 * 60_000).toISOString()],
        ]),
        createServices(occurrence.kind, calls),
      );

      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(result.matchedCases[0]?.id, occurrence.expectedCaseId);
      assert.ok(calls.includes('/aws/ecs/pn-delivery'));

      if (
        occurrence.kind === 'timeout-expired-execution' ||
        occurrence.kind === 'external-registries-selfcare-timeout' ||
        occurrence.kind === 'external-registries-connection-aborted'
      ) {
        assert.strictEqual(result.finalContext.vars.get('apiGwExecutionLogMode'), 'unavailable');
        assert.match(result.finalContext.vars.get('apiGwExecutionLogUnavailableReason') ?? '', /retention settings/);
      }
    });
  }
});
