import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ConditionEvaluator } from '../../framework.js';
import type { RunbookContext } from '../../framework.js';

import { KNOWN_CASES } from '../knownCases.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';

interface CaseEvidence {
  readonly id: string;
  readonly vars?: Record<string, string>;
  readonly steps?: ReadonlyArray<readonly [string, unknown]>;
}

function context(evidence: CaseEvidence): RunbookContext {
  return {
    executionId: 'known-case-test',
    startedAt: new Date('2026-08-29T09:00:00.000Z'),
    stepResults: new Map(evidence.steps ?? []),
    vars: new Map(Object.entries(evidence.vars ?? {})),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

const DOCUMENTED_CASES: ReadonlyArray<CaseEvidence> = [
  {
    // From the Watchtower analysis of 2026-03-25; not in the runbook PDF.
    id: 'selfcare-tls-hostname-mismatch',
    steps: [
      [
        'query-pn-data-vault',
        [
          '[DOWNSTREAM] Service SelfcarePG returned errors=No subject alternative DNS name matching api.selfcare.pagopa.it found.',
        ],
      ],
    ],
  },
  {
    // From the Watchtower analysis of 2026-03-31; not in the runbook PDF.
    id: 'pn-ss-get-file-document-deleted',
    steps: [['query-pn-f24', ['Ending process getFile() with errors=410 GONE "Document has been deleted"']]],
  },
  {
    // Observed in production (2026-04-25, 2026-04-08); not in the runbook PDF.
    id: 'apigw-waf-rule-evaluation-error',
    vars: {
      apiGwStatusCode: '500',
      apiGwErrorMessage: 'There was an error evaluating the AWS WAF rules associated with this API',
    },
  },
  {
    // Observed in production (2026-06-02); not in the runbook PDF.
    id: 'apigw-endpoint-network-error',
    vars: { apiGwStatusCode: '504', apiGwErrorMessage: 'Network error communicating with endpoint' },
  },
  {
    id: 'pdv-tokenizer-404-tbd',
    steps: [
      [
        'query-pn-data-vault',
        [
          '[DOWNSTREAM] Service PersonalDataVault_Tokenizer returned errors=404 Not Found from GET ' +
            'https://api.tokenizer.pdv.pagopa.it/tokenizer/v1/tokens/id/pii',
        ],
      ],
    ],
  },
  {
    id: 'pn-ss-pn-f24-read-forbidden',
    steps: [
      [
        'query-pn-safestorage',
        ['Ending process getFile() with errors=403 FORBIDDEN "Client : pn-f24 not has privilege for read document"'],
      ],
    ],
  },
  {
    id: 'pn-f24-safe-storage-metadata-gone',
    vars: {
      apiGwStatusCode: '500',
      apiGwPath: '/delivery/notifications/sent/IUN/attachments/payment/0/F24',
    },
    steps: [
      [
        'query-pn-f24',
        ['WebClientResponseException$Gone: 410 Gone from GET http://vpce/safe-storage/v1/files/PN_F24_META-id.json'],
      ],
    ],
  },
  {
    id: 'delivery-document-index-out-of-bounds',
    vars: {
      apiGwStatusCode: '500',
      apiGwPath: '/delivery/notifications/sent/IUN/attachments/documents/-1',
    },
    steps: [
      [
        'query-pn-delivery',
        [
          'it.pagopa.pn.commons.exceptions.PnInternalException: Internal Server Error; nested exception is java.lang.ArrayIndexOutOfBoundsException',
        ],
      ],
    ],
  },
  {
    id: 'delivery-missing-payment-attachment-index',
    vars: {
      apiGwStatusCode: '500',
      apiGwPath: '/delivery/notifications/sent/IUN/attachments/payment/0/PAGOPA',
    },
    steps: [
      [
        'query-pn-delivery',
        [
          '[AUD_NT_ATCHOPEN_SND] FAILURE - Notification without payment attachment index - ' +
            'code: PN_DELIVERY_NOTIFICATIONWITHOUTPAYMENTATTACHMENT',
        ],
      ],
    ],
  },
  {
    id: 'apigw-lambda-invocation-503',
    vars: { apiGwStatusCode: '503', apiGwErrorMessage: 'Internal server error' },
    steps: [
      [
        'query-api-gw-execution-logs',
        ['Lambda invocation failed with status: 503. Lambda request id: 12345678-1234-1234-1234-123456789012'],
      ],
    ],
  },
  {
    id: 'apigw-endpoint-timeout-no-delivery-logs',
    vars: { apiGwStatusCode: '504', apiGwErrorMessage: 'Endpoint request timed out', deliveryLogCount: '0' },
  },
  {
    id: 'apigw-500-no-application-logs',
    vars: {
      apiGwStatusCode: '500',
      apiGwErrorMessage: '-',
      deliveryLogCount: '0',
      versioningLambdaProbeState: 'queried',
      versioningLambdaErrorCount: '0',
    },
  },
  {
    id: 'data-vault-selfcarepg-500',
    steps: [
      [
        'query-pn-data-vault',
        [
          '[DOWNSTREAM] Service SelfcarePG returned errors=500 Internal Server Error from POST ' +
            'https://api.selfcare.pagopa.it/external/data-vault/v1/pn-pg/institutions/add',
        ],
      ],
    ],
  },
  {
    id: 'data-vault-selfcare-read-timeout',
    steps: [
      [
        'query-pn-data-vault',
        [
          'WebClientRequestException: nested exception is io.netty.handler.timeout.ReadTimeoutException\n' +
            'Request to POST https://api.selfcare.pagopa.it/external/data-vault/v1/pn-pg/institutions/add',
        ],
      ],
    ],
  },
  {
    id: 'external-registries-selfcarepg-read-timeout',
    steps: [
      [
        'query-pn-external-registries',
        [
          '[DOWNSTREAM] Service SelfcarePG returned errors=nested exception is io.netty.handler.timeout.ReadTimeoutException',
        ],
      ],
    ],
  },
  {
    id: 'external-registries-selfcare-retry-timeout',
    steps: [
      [
        'query-pn-external-registries',
        [
          'Exception caught by retry',
          'ResourceAccessException: I/O error on GET request for http://internal/ext-registry-private/pa/v1/groups-all: ' +
            'Read timed out',
        ],
      ],
    ],
  },
  {
    id: 'external-registries-connection-aborted',
    steps: [
      [
        'query-pn-external-registries',
        ['Caused by: reactor.netty.channel.AbortedException: Connection has been closed BEFORE send operation'],
      ],
    ],
  },
  {
    id: 'data-vault-connection-aborted-after-success',
    steps: [
      [
        'query-pn-data-vault',
        [
          'reactor.netty.channel.AbortedException: Connection has been closed BEFORE send operation',
          'Successful API operation: RecipientsApi._getRecipientDenominationByInternalId(..)(). Result: 200 OK',
          'Ending process _getRecipientDenominationByInternalId',
        ],
      ],
    ],
  },
  {
    id: 'delivery-external-registries-read-timeout',
    vars: { externalRegistriesLogCount: '0' },
    steps: [
      [
        'query-pn-delivery',
        [
          'Error during retrieve of the groups - ResourceAccessException: I/O error on GET request for ' +
            'http://internal/ext-registry-private/pa/v1/groups-all: Read timed out',
        ],
      ],
    ],
  },
  {
    id: 'delivery-data-vault-read-timeout',
    vars: { dataVaultLogCount: '0' },
    steps: [
      [
        'query-pn-delivery',
        [
          'I/O error on POST request for "http://alb.confidential.pn.internal:8080/datavault-private/v1/recipients/external/PG": ' +
            'Read timed out; nested exception is java.net.SocketTimeoutException',
        ],
      ],
    ],
  },
];

describe('pn-delivery-B2B-ApiGwAlarm known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('covers every documented and production-observed case', () => {
    assert.strictEqual(KNOWN_CASES.length, DOCUMENTED_CASES.length);

    for (const evidence of DOCUMENTED_CASES) {
      const knownCase = KNOWN_CASES.find((candidate) => candidate.id === evidence.id);
      assert.ok(knownCase !== undefined, `missing known case ${evidence.id}`);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, context(evidence)), true, evidence.id);
    }
  });

  it('keeps IDs and priorities unique', () => {
    assert.strictEqual(new Set(KNOWN_CASES.map((knownCase) => knownCase.id)).size, KNOWN_CASES.length);
    assert.strictEqual(new Set(KNOWN_CASES.map((knownCase) => knownCase.priority)).size, KNOWN_CASES.length);
  });

  it('keeps every actionable case above every automatically completed case', () => {
    const actionable = KNOWN_CASES.filter((knownCase) => knownCase.analysis?.proposedStatus === 'IN_PROGRESS');
    const completed = KNOWN_CASES.filter((knownCase) => knownCase.analysis?.proposedStatus === 'COMPLETED');
    const minimumActionable = Math.min(...actionable.map((knownCase) => knownCase.priority));
    const maximumCompleted = Math.max(...completed.map((knownCase) => knownCase.priority));

    assert.ok(minimumActionable > maximumCompleted);
  });

  it('does not resolve the no-log versioning case before the Lambda probe runs', () => {
    const knownCase = KNOWN_CASES.find((candidate) => candidate.id === 'apigw-500-no-application-logs');
    assert.ok(knownCase !== undefined);

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        context({
          id: knownCase.id,
          vars: {
            apiGwStatusCode: '500',
            apiGwErrorMessage: 'Internal server error',
            deliveryLogCount: '0',
          },
        }),
      ),
      false,
    );
  });

  it('resolves a generic API Gateway 500 only after both application probes return zero errors', () => {
    const knownCase = KNOWN_CASES.find((candidate) => candidate.id === 'apigw-500-no-application-logs');
    assert.ok(knownCase !== undefined);

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        context({
          id: knownCase.id,
          vars: {
            apiGwStatusCode: '500',
            apiGwErrorMessage: 'Internal server error',
            deliveryLogCount: '0',
            versioningLambdaProbeState: 'queried',
            versioningLambdaErrorCount: '0',
          },
        }),
      ),
      true,
    );
  });

  it('does not infer zero Lambda errors from an unavailable probe', () => {
    const knownCase = KNOWN_CASES.find((candidate) => candidate.id === 'apigw-500-no-application-logs');
    assert.ok(knownCase !== undefined);

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        context({
          id: knownCase.id,
          vars: {
            apiGwStatusCode: '500',
            apiGwErrorMessage: 'Internal server error',
            deliveryLogCount: '0',
            versioningLambdaProbeState: 'unavailable',
            versioningLambdaErrorCount: '',
          },
        }),
      ),
      false,
    );
  });

  it('does not hide Lambda errors, WAF errors, or API Gateway network errors behind the no-log case', () => {
    const knownCase = KNOWN_CASES.find((candidate) => candidate.id === 'apigw-500-no-application-logs');
    assert.ok(knownCase !== undefined);

    const scenarios: ReadonlyArray<Readonly<Record<string, string>>> = [
      {
        apiGwStatusCode: '500',
        apiGwErrorMessage: 'Internal server error',
        deliveryLogCount: '0',
        versioningLambdaProbeState: 'queried',
        versioningLambdaErrorCount: '1',
      },
      {
        apiGwStatusCode: '500',
        apiGwErrorMessage: 'AWS WAF evaluation error',
        deliveryLogCount: '0',
        versioningLambdaProbeState: 'queried',
        versioningLambdaErrorCount: '0',
      },
      {
        apiGwStatusCode: '500',
        apiGwErrorMessage: 'Network error communicating with endpoint',
        deliveryLogCount: '0',
        versioningLambdaProbeState: 'queried',
        versioningLambdaErrorCount: '0',
      },
    ];

    for (const vars of scenarios) {
      assert.strictEqual(
        evaluator.evaluate(knownCase.condition, context({ id: knownCase.id, vars: { ...vars } })),
        false,
      );
    }
  });

  it('recognizes the production pn-exception stack variant of the Selfcare ReadTimeout', () => {
    const expected = 'external-registries-selfcarepg-read-timeout';
    const evidence = context({
      id: expected,
      steps: [
        [
          'query-pn-external-registries',
          [
            'pn-exception 500 catched problem=class Problem { title: Internal Server Error }\n' +
              'Error has been observed at the following site(s):\n' +
              '*__checkpoint ⇢ Request to GET https://api.selfcare.pagopa.it/external/v2/user-groups [DefaultWebClient]\n' +
              'Caused by: io.netty.handler.timeout.ReadTimeoutException: null',
          ],
        ],
      ],
    });
    const matches = KNOWN_CASES.filter((knownCase) => evaluator.evaluate(knownCase.condition, evidence)).map(
      (knownCase) => knownCase.id,
    );

    assert.deepStrictEqual(matches, [expected]);
  });

  it('keeps the delivery timeout as fallback when a deeper external-registries cause is available', () => {
    const deliveryEvidence =
      'Error during retrieve of the groups - ResourceAccessException: I/O error on GET request for ' +
      'http://internal/ext-registry-private/pa/v1/groups-all: Read timed out';
    const scenarios: ReadonlyArray<readonly [string, string]> = [
      [
        'external-registries-selfcarepg-read-timeout',
        'pn-exception 500; Request to GET https://api.selfcare.pagopa.it/external/v2/user-groups; ' +
          'Caused by: io.netty.handler.timeout.ReadTimeoutException: null',
      ],
      [
        'external-registries-connection-aborted',
        'Caused by: reactor.netty.channel.AbortedException: Connection has been closed BEFORE send operation',
      ],
    ];

    for (const [expected, downstreamEvidence] of scenarios) {
      const evidence = context({
        id: expected,
        vars: { externalRegistriesLogCount: '1' },
        steps: [
          ['query-pn-delivery', [deliveryEvidence]],
          ['query-pn-external-registries', [downstreamEvidence]],
        ],
      });
      const matches = KNOWN_CASES.filter((knownCase) => evaluator.evaluate(knownCase.condition, evidence)).map(
        (knownCase) => knownCase.id,
      );

      assert.deepStrictEqual(matches, [expected]);
    }
  });
});
