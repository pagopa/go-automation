import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Condition, KnownCase } from '@go-automation/go-runbook';

import { KNOWN_CASES as TOKEN_EXCHANGE_CASES } from '../pn-tokenExchangeLambda-LogInvocationErrors-Alarm/knownCases.js';
import { KNOWN_CASES as IO_AUTHORIZER_CASES } from '../pn-ioAuthorizerLambda-LogInvocationErrors-Alarm/knownCases.js';
import { KNOWN_CASES as SLA_CASES } from '../pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm/knownCases.js';
import { KNOWN_CASES as JWKS_CACHE_REFRESH_CASES } from '../pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm/knownCases.js';
import { KNOWN_CASES as API_KEY_AUTHORIZER_CASES } from '../pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm/knownCases.js';
import { KNOWN_CASES as DELIVERY_INSERT_TRIGGER_EB_CASES } from '../pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm/knownCases.js';
import { buildTokenExchangeLambdaRunbook } from '../pn-tokenExchangeLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildIoAuthorizerLambdaRunbook } from '../pn-ioAuthorizerLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildSlaViolationCheckerLambdaSqsRunbook } from '../pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm/runbook.js';
import { buildJwksCacheRefreshLambdaLogInvocationErrorsAlarmRunbook } from '../pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildApiKeyAuthorizerV2LambdaLogInvocationErrorsAlarmRunbook } from '../pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm/runbook.js';
import { buildDeliveryInsertTriggerEbLambdaLogInvocationErrorsAlarmRunbook } from '../pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm/runbook.js';

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

/** True when some known case has a regex matching the given log message. */
function matchesSomeCase(cases: ReadonlyArray<KnownCase>, message: string): boolean {
  return cases.some((knownCase) =>
    collectRegexes(knownCase.condition).some((pattern) => new RegExp(pattern).test(message)),
  );
}

describe('lambda runbook known cases', () => {
  it('matches the pn-emd-integration downstream messages (tokenExchange)', () => {
    assert.ok(
      matchesSomeCase(TOKEN_EXCHANGE_CASES, 'detail: _tokenCheckTPP.retrievalId: size must be between 50 and 50'),
    );
    assert.ok(matchesSomeCase(TOKEN_EXCHANGE_CASES, 'GenerateKoResponse this err Error: Error in get retrievalId'));
    assert.ok(
      matchesSomeCase(
        TOKEN_EXCHANGE_CASES,
        'Ending process _tokenCheckTPP with errors=Error getting retrieval payload',
      ),
    );
  });

  it('matches the pn-ioAuthorizerLambda messages', () => {
    assert.ok(
      matchesSomeCase(
        IO_AUTHORIZER_CASES,
        'Error generating IAM policy with error Error: Error in get external Id: socket hang up',
      ),
    );
    assert.ok(matchesSomeCase(IO_AUTHORIZER_CASES, 'ERROR Invalid source details header QRCODE'));
  });

  it('keeps a category-based timeout case for the SQS Lambda', () => {
    const timeout = SLA_CASES.find((knownCase) => knownCase.id === 'lambda-timeout');
    assert.ok(timeout !== undefined);
    assert.deepStrictEqual(timeout.condition, {
      type: 'compare',
      ref: 'vars.lambdaErrorCategory',
      operator: '==',
      value: 'timeout',
    });
  });

  it('matches the pn-jwksCacheRefreshLambda external JWKS endpoint failures', () => {
    assert.ok(
      matchesSomeCase(
        JWKS_CACHE_REFRESH_CASES,
        'Error during addJwksCacheEntry for issuer caftfdc_pagopa.it Error: Error downloading URL: https://iqpanel.inquery.it/.tfdc-wellknown/jwks.json, status: 503, statusText: Service Unavailable',
      ),
    );
    assert.ok(
      matchesSomeCase(
        JWKS_CACHE_REFRESH_CASES,
        'ERROR Error during addJwksCacheEntry for issuer gestione.sedi.uci.it Error: Error downloading URL: https://gestione.sedi.uci.it/.well-known/jwks.json, status: 502, statusText: Bad Gateway',
      ),
    );
    assert.ok(
      matchesSomeCase(
        JWKS_CACHE_REFRESH_CASES,
        'Error during addJwksCacheEntry for issuer radd.example.it AxiosError: read ECONNRESET',
      ),
    );
    assert.ok(
      matchesSomeCase(
        JWKS_CACHE_REFRESH_CASES,
        'Error downloading URL: https://www.cafconfagricoltura.it/.well-known/jwks.json, status: 500, statusText: URL Rewrite Module Error.',
      ),
    );
    assert.ok(
      matchesSomeCase(
        JWKS_CACHE_REFRESH_CASES,
        'Error downloading URL: https://iqpanel.inquery.it/.well-known/jwks.json, status: 500, statusText: Internal Server Error',
      ),
    );
  });

  it('matches the pn-ApiKeyAuthorizerV2Lambda document-specific cases', () => {
    const timeout = API_KEY_AUTHORIZER_CASES.find(
      (knownCase) => knownCase.id === 'apikey-authorizer-timeout-single-occurrence',
    );
    assert.ok(timeout !== undefined);
    assert.strictEqual(timeout.priority, 110);
    assert.deepStrictEqual(timeout.condition, {
      type: 'compare',
      ref: 'vars.lambdaErrorCategory',
      operator: '==',
      value: 'timeout',
    });
    assert.ok(matchesSomeCase(API_KEY_AUTHORIZER_CASES, 'Error in get key AxiosError: read ECONNRESET'));
  });

  it('keeps a document-specific timeout case for pn-delivery-insert-trigger-eb-lambda', () => {
    const timeout = DELIVERY_INSERT_TRIGGER_EB_CASES.find(
      (knownCase) => knownCase.id === 'delivery-insert-trigger-eb-timeout-single-occurrence',
    );
    assert.ok(timeout !== undefined);
    assert.strictEqual(timeout.priority, 110);
    assert.deepStrictEqual(timeout.condition, {
      type: 'compare',
      ref: 'vars.lambdaErrorCategory',
      operator: '==',
      value: 'timeout',
    });
  });

  it('builds the lambda runbooks without validation errors', () => {
    assert.doesNotThrow(() => buildTokenExchangeLambdaRunbook());
    assert.doesNotThrow(() => buildIoAuthorizerLambdaRunbook());
    assert.doesNotThrow(() => buildSlaViolationCheckerLambdaSqsRunbook());
    assert.doesNotThrow(() => buildJwksCacheRefreshLambdaLogInvocationErrorsAlarmRunbook());
    assert.doesNotThrow(() => buildApiKeyAuthorizerV2LambdaLogInvocationErrorsAlarmRunbook());
    assert.doesNotThrow(() => buildDeliveryInsertTriggerEbLambdaLogInvocationErrorsAlarmRunbook());
  });
});
