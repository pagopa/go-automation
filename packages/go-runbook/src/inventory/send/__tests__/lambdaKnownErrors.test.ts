import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Condition, KnownError } from '../../../engine/index.js';
import { SEND_DOWNSTREAMS } from '../../../toolkits/send/index.js';
import { matchDownstreamErrorPattern } from '../../../toolkits/common/families/lambda/helpers/matchDownstreamErrorPattern.js';

import { KNOWN_ERRORS as TOKEN_EXCHANGE_CASES } from '../lambda/pn-tokenExchangeLambda-LogInvocationErrors-Alarm/knownErrors.js';
import { KNOWN_ERRORS as IO_AUTHORIZER_CASES } from '../lambda/pn-ioAuthorizerLambda-LogInvocationErrors-Alarm/knownErrors.js';
import { KNOWN_ERRORS as JWKS_CACHE_REFRESH_CASES } from '../lambda/pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm/knownErrors.js';
import { KNOWN_ERRORS as API_KEY_AUTHORIZER_CASES } from '../lambda/pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm/knownErrors.js';
import { KNOWN_ERRORS as LOLLIPOP_AUTHORIZER_CASES } from '../lambda/pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm/knownErrors.js';
import { DOWNSTREAM_ERROR_PATTERNS as LOLLIPOP_AUTHORIZER_DOWNSTREAM_PATTERNS } from '../lambda/pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm/downstreamErrorPatterns.js';
import { createTestContext } from '../../../__tests__/helpers/createTestContext.js';
import { caseMatches, knownErrorById } from '../../../__tests__/helpers/knownErrorMatching.js';
import { logRow } from '../../../__tests__/helpers/logRow.js';

const CIE_KEYS_TIMEOUT = 'ERROR Errore nella chiamata idpKeysCieGet: undefined - Message: Timeout of 1000ms exceeded';
const SPID_KEYS_TIMEOUT =
  'ERROR Errore nella chiamata idpKeysSpidTagGet: undefined - Message: Timeout of 1000ms exceeded';
const IDP_CERT_ERROR = 'WARN [handleEvent] - Validazione fallita: IDP_CERT_DATA_RETRIEVING_ERROR. Denying access.';

/** Collects every regex string referenced by a condition tree. */
function collectRegexes(condition: Condition): ReadonlyArray<string> {
  switch (condition.type) {
    case 'contains':
      return typeof condition.regex === 'string' ? [condition.regex] : [];
    case 'pattern':
      return [condition.regex];
    case 'and':
    case 'or':
      return condition.conditions.flatMap(collectRegexes);
    case 'not':
      return collectRegexes(condition.condition);
    default:
      return [];
  }
}

/** True when some known error has a regex matching the given log message. */
function matchesSomeCase(cases: ReadonlyArray<KnownError>, message: string): boolean {
  return cases.some((knownError) =>
    collectRegexes(knownError.condition).some((pattern) => new RegExp(pattern).test(message)),
  );
}

/** Context with the given messages as Lambda invocation rows. */
function invocationContext(messages: ReadonlyArray<string>): ReturnType<typeof createTestContext> {
  return createTestContext({
    stepResults: {
      'query-lambda-invocation': messages.map((message) =>
        logRow({ '@requestId': '6ed9a011-d012-4ca3-ab52-024a40c9a723', '@message': message }),
      ),
    },
  });
}

describe('lambda runbook known errors', () => {
  it('recognizes the documented Lambda log messages', () => {
    const documented: ReadonlyArray<readonly [ReadonlyArray<KnownError>, string]> = [
      [TOKEN_EXCHANGE_CASES, 'detail: _tokenCheckTPP.retrievalId: size must be between 50 and 50'],
      [TOKEN_EXCHANGE_CASES, 'GenerateKoResponse this err Error: Error in get retrievalId'],
      [TOKEN_EXCHANGE_CASES, 'Ending process _tokenCheckTPP with errors=Error getting retrieval payload'],
      [IO_AUTHORIZER_CASES, 'Error generating IAM policy with error Error: Error in get external Id: socket hang up'],
      [IO_AUTHORIZER_CASES, 'ERROR Invalid source details header QRCODE'],
      [
        JWKS_CACHE_REFRESH_CASES,
        'Error during addJwksCacheEntry for issuer caftfdc_pagopa.it Error: Error downloading URL: https://iqpanel.inquery.it/.tfdc-wellknown/jwks.json, status: 503, statusText: Service Unavailable',
      ],
      [
        JWKS_CACHE_REFRESH_CASES,
        'ERROR Error during addJwksCacheEntry for issuer gestione.sedi.uci.it Error: Error downloading URL: https://gestione.sedi.uci.it/.well-known/jwks.json, status: 502, statusText: Bad Gateway',
      ],
      [
        JWKS_CACHE_REFRESH_CASES,
        'Error during addJwksCacheEntry for issuer radd.example.it AxiosError: read ECONNRESET',
      ],
      [
        JWKS_CACHE_REFRESH_CASES,
        'Error downloading URL: https://www.cafconfagricoltura.it/.well-known/jwks.json, status: 500, statusText: URL Rewrite Module Error.',
      ],
      [
        JWKS_CACHE_REFRESH_CASES,
        'Error downloading URL: https://iqpanel.inquery.it/.well-known/jwks.json, status: 500, statusText: Internal Server Error',
      ],
      [API_KEY_AUTHORIZER_CASES, 'Error in get key AxiosError: read ECONNRESET'],
      [
        LOLLIPOP_AUTHORIZER_CASES,
        'undefined ERROR Error: Missing AWS Lambda trace data for X-Ray. Ensure Active Tracing is enabled',
      ],
      [LOLLIPOP_AUTHORIZER_CASES, CIE_KEYS_TIMEOUT],
      [LOLLIPOP_AUTHORIZER_CASES, SPID_KEYS_TIMEOUT],
      [LOLLIPOP_AUTHORIZER_CASES, IDP_CERT_ERROR],
      [
        LOLLIPOP_AUTHORIZER_CASES,
        "ERROR Validazione fallita - ErrorCode: SIGNATURE_VALIDATION_ERROR entityID: 'https://spid.register.it'",
      ],
    ];
    for (const [cases, message] of documented) {
      assert.ok(matchesSomeCase(cases, message), message);
    }
  });

  it('classifies BE IO as AppIO', () => {
    const appIoCase = LOLLIPOP_AUTHORIZER_CASES.find(
      ({ code }) => code === 'SEND_LAMBDA_PLALLIEA_APP-IO-BAC-IDP-KEY-UNA',
    );
    const runtimeTimeout = LOLLIPOP_AUTHORIZER_CASES.find(({ code }) => code === 'SEND_LAMBDA_COMMON_LAM-TIM');
    assert.ok(appIoCase !== undefined && runtimeTimeout !== undefined);
    assert.strictEqual(
      caseMatches(knownErrorById(LOLLIPOP_AUTHORIZER_CASES, appIoCase.code), invocationContext([CIE_KEYS_TIMEOUT])),
      true,
    );
    for (const message of [SPID_KEYS_TIMEOUT, IDP_CERT_ERROR]) {
      assert.strictEqual(
        matchDownstreamErrorPattern(message, LOLLIPOP_AUTHORIZER_DOWNSTREAM_PATTERNS),
        SEND_DOWNSTREAMS.APP_IO,
      );
    }
  });

  it('accepts the signature-validation case only for the register.it entityID', () => {
    const signatureError =
      'ERROR Validazione fallita - ErrorCode: SIGNATURE_VALIDATION_ERROR - Message: The assetion signature is not valid';
    for (const [entityId, expected] of [
      ['https://spid.register.it', true],
      ['https://idp.example.it', false],
    ] as const) {
      assert.strictEqual(
        caseMatches(
          knownErrorById(LOLLIPOP_AUTHORIZER_CASES, 'SEND_LAMBDA_PLALLIEA_REG-IT-SIG-VAL-ERR'),
          invocationContext([signatureError, `entityID: '${entityId}'`]),
        ),
        expected,
        entityId,
      );
    }
  });
});
