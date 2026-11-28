import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ConditionEvaluator, type RunbookContext } from '../../../../../engine/index.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';

import { KNOWN_ERRORS } from '../knownErrors.js';

interface CaseEvidence {
  readonly id: string;
  readonly vars?: Record<string, string>;
  readonly steps?: ReadonlyArray<readonly [string, unknown]>;
}

function context(evidence: CaseEvidence): RunbookContext {
  return createTestContext({ stepResults: Object.fromEntries(evidence.steps ?? []), vars: evidence.vars ?? {} });
}

const DOCUMENTED_CASES: ReadonlyArray<CaseEvidence> = [
  {
    // From the Watchtower analysis of 2026-03-25; not in the runbook PDF.
    id: 'SEND_APIGW_PDB2BAGA_SEL-TLS-HOS-MIS',
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
    id: 'SEND_APIGW_PDB2BAGA_PN-SS-GET-FIL-DOC-DEL',
    steps: [['query-pn-f24', ['Ending process getFile() with errors=410 GONE "Document has been deleted"']]],
  },
  {
    // Observed in production (2026-04-25, 2026-04-08); not in the runbook PDF.
    id: 'SEND_APIGW_PDB2BAGA_API-WAF-RUL-EVA-ERR',
    vars: {
      apiGwStatusCode: '500',
      apiGwErrorMessage: 'There was an error evaluating the AWS WAF rules associated with this API',
    },
  },
  {
    // Observed in production (2026-06-02); not in the runbook PDF.
    id: 'SEND_APIGW_PDB2BAGA_API-END-NET-ERR',
    vars: { apiGwStatusCode: '504', apiGwErrorMessage: 'Network error communicating with endpoint' },
  },
  {
    id: 'SEND_APIGW_PDB2BAGA_PDV-TOK-404-TBD',
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
    id: 'SEND_APIGW_PDB2BAGA_PN-SS-PN-F24-REA-FOR',
    steps: [
      [
        'query-pn-safestorage',
        ['Ending process getFile() with errors=403 FORBIDDEN "Client : pn-f24 not has privilege for read document"'],
      ],
    ],
  },
  {
    id: 'SEND_APIGW_PDB2BAGA_PN-F24-SAF-STO-MET-GON',
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
    id: 'SEND_APIGW_PDB2BAGA_DEL-DOC-IND-OUT-OF-BOU',
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
    id: 'SEND_APIGW_PDB2BAGA_DEL-MIS-PAY-ATT-IND',
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
    id: 'SEND_APIGW_PDB2BAGA_API-LAM-INV-503',
    vars: { apiGwStatusCode: '503', apiGwErrorMessage: 'Internal server error' },
    steps: [
      [
        'query-api-gw-execution-logs',
        ['Lambda invocation failed with status: 503. Lambda request id: 12345678-1234-1234-1234-123456789012'],
      ],
    ],
  },
  {
    id: 'SEND_APIGW_PDB2BAGA_API-END-TIM-NO-DEL-LOG',
    vars: {
      apiGwStatusCode: '504',
      apiGwErrorMessage: 'Endpoint request timed out',
      deliveryLookupState: 'queried',
      deliveryLogCount: '0',
    },
  },
  {
    id: 'SEND_APIGW_PDB2BAGA_API-500-NO-APP-LOG',
    vars: {
      apiGwStatusCode: '500',
      apiGwErrorMessage: '-',
      deliveryLookupState: 'queried',
      deliveryLogCount: '0',
      versioningLambdaProbeState: 'queried',
      versioningLambdaErrorCount: '0',
    },
  },
  {
    id: 'SEND_APIGW_PDB2BAGA_DAT-VAU-SEL-500',
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
    id: 'SEND_APIGW_PDB2BAGA_DAT-VAU-SEL-REA-TIM',
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
    id: 'SEND_APIGW_PDB2BAGA_EXT-REG-SEL-REA-TIM',
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
    id: 'SEND_APIGW_PDB2BAGA_EXT-REG-SEL-RET-TIM',
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
    id: 'SEND_APIGW_PDB2BAGA_EXT-REG-CON-ABO',
    steps: [
      [
        'query-pn-external-registries',
        ['Caused by: reactor.netty.channel.AbortedException: Connection has been closed BEFORE send operation'],
      ],
    ],
  },
  {
    id: 'SEND_APIGW_PDB2BAGA_DAT-VAU-CON-ABO-AFT-SUC',
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
    id: 'SEND_APIGW_PDB2BAGA_DEL-EXT-REG-REA-TIM',
    vars: { 'externalRegistriesExclusion.specificDiagnosis': 'absent' },
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
    id: 'SEND_APIGW_PDB2BAGA_DEL-DAT-VAU-REA-TIM',
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

describe('pn-delivery-B2B-ApiGwAlarm known errors', () => {
  const evaluator = new ConditionEvaluator();

  it('never reads a skipped or partial pn-delivery read as the absence of errors', () => {
    for (const deliveryLookupState of ['skipped', 'saturated', 'unavailable']) {
      const context = createTestContext({
        vars: {
          apiGwStatusCode: '504',
          apiGwErrorMessage: 'Endpoint request timed out',
          deliveryLookupState,
          deliveryLogCount: '0',
        },
      });
      const knownError = KNOWN_ERRORS.find(
        (candidate) => candidate.code === 'SEND_APIGW_PDB2BAGA_API-END-TIM-NO-DEL-LOG',
      );
      assert.ok(knownError !== undefined);
      assert.strictEqual(evaluator.evaluate(knownError.condition, context), false, deliveryLookupState);
    }
  });

  it('covers every documented and production-observed case', () => {
    assert.strictEqual(KNOWN_ERRORS.length, DOCUMENTED_CASES.length);

    for (const evidence of DOCUMENTED_CASES) {
      const knownError = KNOWN_ERRORS.find((candidate) => candidate.code === evidence.id);
      assert.ok(knownError !== undefined, `missing known error ${evidence.id}`);
      assert.strictEqual(evaluator.evaluate(knownError.condition, context(evidence)), true, evidence.id);
    }
  });

  it('matches every numeric out-of-bounds document index without accepting arbitrary path segments', () => {
    const knownError = KNOWN_ERRORS.find(
      (candidate) => candidate.code === 'SEND_APIGW_PDB2BAGA_DEL-DOC-IND-OUT-OF-BOU',
    );
    assert.ok(knownError !== undefined);
    const outOfBoundsError = (index: string): string =>
      'it.pagopa.pn.commons.exceptions.PnInternalException: Internal Server Error; nested exception is ' +
      `java.lang.ArrayIndexOutOfBoundsException: Index ${index} out of bounds for length 2`;

    for (const index of ['-1', '2', '3', '2147483647']) {
      assert.strictEqual(
        evaluator.evaluate(
          knownError.condition,
          context({
            id: knownError.code,
            vars: {
              apiGwStatusCode: '500',
              apiGwPath: `/delivery/notifications/sent/IUN/attachments/documents/${index}`,
            },
            steps: [['query-pn-delivery', [outOfBoundsError(index)]]],
          }),
        ),
        true,
        `expected numeric index ${index} to match`,
      );
    }

    for (const path of [
      '/delivery/notifications/sent/IUN/attachments/documents/not-a-number',
      '/delivery/notifications/sent/IUN/attachments/payment/2',
    ]) {
      assert.strictEqual(
        evaluator.evaluate(
          knownError.condition,
          context({
            id: knownError.code,
            vars: { apiGwStatusCode: '500', apiGwPath: path },
            steps: [['query-pn-delivery', [outOfBoundsError('2')]]],
          }),
        ),
        false,
        `expected path ${path} not to match`,
      );
    }

    assert.strictEqual(
      evaluator.evaluate(
        knownError.condition,
        context({
          id: knownError.code,
          vars: {
            apiGwStatusCode: '500',
            apiGwPath: '/delivery/notifications/sent/IUN/attachments/documents/2',
          },
          steps: [['query-pn-delivery', ['java.lang.IllegalArgumentException: invalid document index']]],
        }),
      ),
      false,
    );
  });

  it('resolves a generic API Gateway 500 only after both application probes return zero errors', () => {
    const knownError = KNOWN_ERRORS.find((candidate) => candidate.code === 'SEND_APIGW_PDB2BAGA_API-500-NO-APP-LOG');
    assert.ok(knownError !== undefined);
    const probed = {
      apiGwStatusCode: '500',
      apiGwErrorMessage: 'Internal server error',
      deliveryLookupState: 'queried',
      deliveryLogCount: '0',
      versioningLambdaProbeState: 'queried',
      versioningLambdaErrorCount: '0',
    };

    for (const [vars, expected] of [
      [probed, true],
      // Before the Lambda probe runs.
      [
        {
          apiGwStatusCode: '500',
          apiGwErrorMessage: 'Internal server error',
          deliveryLookupState: 'queried',
          deliveryLogCount: '0',
        },
        false,
      ],
      // An unavailable probe proves nothing about Lambda errors.
      [{ ...probed, versioningLambdaProbeState: 'unavailable', versioningLambdaErrorCount: '' }, false],
      // Lambda, WAF and network errors must not hide behind the no-log case.
      [{ ...probed, versioningLambdaErrorCount: '1' }, false],
      [{ ...probed, apiGwErrorMessage: 'AWS WAF evaluation error' }, false],
      [{ ...probed, apiGwErrorMessage: 'Network error communicating with endpoint' }, false],
    ] as const) {
      assert.strictEqual(
        evaluator.evaluate(knownError.condition, context({ id: knownError.code, vars: { ...vars } })),
        expected,
        JSON.stringify(vars),
      );
    }
  });

  it('recognizes the production pn-exception stack variant of the Selfcare ReadTimeout', () => {
    const expected = 'SEND_APIGW_PDB2BAGA_EXT-REG-SEL-REA-TIM';
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
    const matches = KNOWN_ERRORS.filter((knownError) => evaluator.evaluate(knownError.condition, evidence)).map(
      (knownError) => knownError.code,
    );

    assert.deepStrictEqual(matches, [expected]);
  });

  it('keeps the delivery timeout as fallback when a deeper external-registries cause is available', () => {
    const deliveryEvidence =
      'Error during retrieve of the groups - ResourceAccessException: I/O error on GET request for ' +
      'http://internal/ext-registry-private/pa/v1/groups-all: Read timed out';
    const scenarios: ReadonlyArray<readonly [string, string]> = [
      [
        'SEND_APIGW_PDB2BAGA_EXT-REG-SEL-REA-TIM',
        'pn-exception 500; Request to GET https://api.selfcare.pagopa.it/external/v2/user-groups; ' +
          'Caused by: io.netty.handler.timeout.ReadTimeoutException: null',
      ],
      [
        'SEND_APIGW_PDB2BAGA_EXT-REG-CON-ABO',
        'Caused by: reactor.netty.channel.AbortedException: Connection has been closed BEFORE send operation',
      ],
    ];

    for (const [expected, downstreamEvidence] of scenarios) {
      const evidence = context({
        id: expected,
        vars: { 'externalRegistriesExclusion.specificDiagnosis': 'present' },
        steps: [
          ['query-pn-delivery', [deliveryEvidence]],
          ['query-pn-external-registries', [downstreamEvidence]],
        ],
      });
      const matches = KNOWN_ERRORS.filter((knownError) => evaluator.evaluate(knownError.condition, evidence)).map(
        (knownError) => knownError.code,
      );

      assert.deepStrictEqual(matches, [expected]);
    }
  });
});
