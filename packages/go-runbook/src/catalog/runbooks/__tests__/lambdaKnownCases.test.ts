import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ConditionEvaluator, lambda, SEND_DOWNSTREAMS } from '../framework.js';
import type { Condition, KnownCase, RunbookContext, ServiceRegistry } from '../framework.js';

import { KNOWN_CASES as TOKEN_EXCHANGE_CASES } from '../pn-tokenExchangeLambda-LogInvocationErrors-Alarm/knownCases.js';
import { KNOWN_CASES as IO_AUTHORIZER_CASES } from '../pn-ioAuthorizerLambda-LogInvocationErrors-Alarm/knownCases.js';
import { KNOWN_CASES as SLA_CASES } from '../pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm/knownCases.js';
import { KNOWN_CASES as JWKS_CACHE_REFRESH_CASES } from '../pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm/knownCases.js';
import { KNOWN_CASES as API_KEY_AUTHORIZER_CASES } from '../pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm/knownCases.js';
import { KNOWN_CASES as DELIVERY_INSERT_TRIGGER_EB_CASES } from '../pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm/knownCases.js';
import { KNOWN_CASES as LOLLIPOP_AUTHORIZER_CASES } from '../pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm/knownCases.js';
import { DOWNSTREAM_ERROR_PATTERNS as LOLLIPOP_AUTHORIZER_DOWNSTREAM_PATTERNS } from '../pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm/knownErrors.js';
import { buildRunbook as buildTokenExchangeLambdaRunbook } from '../pn-tokenExchangeLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildRunbook as buildIoAuthorizerLambdaRunbook } from '../pn-ioAuthorizerLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildRunbook as buildSlaViolationCheckerLambdaSqsRunbook } from '../pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm/runbook.js';
import { buildRunbook as buildJwksCacheRefreshLambdaLogInvocationErrorsAlarmRunbook } from '../pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildRunbook as buildApiKeyAuthorizerV2LambdaLogInvocationErrorsAlarmRunbook } from '../pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm/runbook.js';
import { buildRunbook as buildDeliveryInsertTriggerEbLambdaLogInvocationErrorsAlarmRunbook } from '../pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm/runbook.js';
import { buildRunbook as buildLollipopAuthorizerLambdaLogInvocationErrorsAlarmRunbook } from '../pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm/runbook.js';

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

interface LambdaLogField {
  readonly field: string;
  readonly value: string;
}

function lambdaLogContext(messages: ReadonlyArray<string>): RunbookContext {
  const rows: ReadonlyArray<ReadonlyArray<LambdaLogField>> = messages.map((message) => [
    { field: '@timestamp', value: '2026-05-25 10:00:00.000' },
    { field: '@requestId', value: '6ed9a011-d012-4ca3-ab52-024a40c9a723' },
    { field: '@message', value: message },
  ]);
  return {
    executionId: 'test',
    startedAt: new Date('2026-05-25T10:00:00.000Z'),
    stepResults: new Map([['query-lambda-invocation', rows]]),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

function knownCaseById(cases: ReadonlyArray<KnownCase>, id: string): KnownCase {
  const knownCase = cases.find((candidate) => candidate.id === id);
  assert.ok(knownCase !== undefined, `known case not found: ${id}`);
  return knownCase;
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

  it('matches the pn-lollipopAuthorizerLambda document-specific cases', () => {
    assert.ok(
      matchesSomeCase(
        LOLLIPOP_AUTHORIZER_CASES,
        'undefined ERROR Error: Missing AWS Lambda trace data for X-Ray. Ensure Active Tracing is enabled',
      ),
    );
    assert.ok(
      matchesSomeCase(
        LOLLIPOP_AUTHORIZER_CASES,
        'ERROR Errore nella chiamata idpKeysCieGet: undefined - Message: Timeout of 1000ms exceeded',
      ),
    );
    assert.ok(
      matchesSomeCase(
        LOLLIPOP_AUTHORIZER_CASES,
        'ERROR Errore nella chiamata idpKeysSpidTagGet: undefined - Message: Timeout of 1000ms exceeded',
      ),
    );
    assert.ok(
      matchesSomeCase(
        LOLLIPOP_AUTHORIZER_CASES,
        'WARN [handleEvent] - Validazione fallita: IDP_CERT_DATA_RETRIEVING_ERROR. Denying access.',
      ),
    );
    assert.ok(
      matchesSomeCase(
        LOLLIPOP_AUTHORIZER_CASES,
        "ERROR Validazione fallita - ErrorCode: SIGNATURE_VALIDATION_ERROR entityID: 'https://spid.register.it'",
      ),
    );
  });

  it('classifies BE IO as AppIO and waits for its backend to recover', () => {
    const appIoCase = knownCaseById(LOLLIPOP_AUTHORIZER_CASES, 'app-io-backend-idp-keys-unavailable');
    const runtimeTimeout = knownCaseById(LOLLIPOP_AUTHORIZER_CASES, 'lambda-timeout');
    const evaluator = new ConditionEvaluator();

    assert.ok(appIoCase.priority > runtimeTimeout.priority);
    assert.strictEqual(
      evaluator.evaluate(
        appIoCase.condition,
        lambdaLogContext([
          'ERROR Errore nella chiamata idpKeysCieGet: undefined - Message: Timeout of 1000ms exceeded',
        ]),
      ),
      true,
    );
    assert.deepStrictEqual(appIoCase.analysis?.downstreams, [SEND_DOWNSTREAMS.APP_IO]);
    assert.strictEqual(appIoCase.analysis?.proposedStatus, 'COMPLETED');
    assert.match(appIoCase.analysis?.resolution ?? '', /attendere il ripristino del backend di IO/i);
    assert.strictEqual(
      lambda.matchDownstreamErrorPattern(
        'ERROR Errore nella chiamata idpKeysSpidTagGet: undefined - Message: Timeout of 1000ms exceeded',
        LOLLIPOP_AUTHORIZER_DOWNSTREAM_PATTERNS,
      ),
      SEND_DOWNSTREAMS.APP_IO,
    );
    assert.strictEqual(
      lambda.matchDownstreamErrorPattern(
        'WARN [handleEvent] - Validazione fallita: IDP_CERT_DATA_RETRIEVING_ERROR. Denying access.',
        LOLLIPOP_AUTHORIZER_DOWNSTREAM_PATTERNS,
      ),
      SEND_DOWNSTREAMS.APP_IO,
    );
  });

  it('accepts the signature-validation case only for the register.it entityID', () => {
    const knownCase = knownCaseById(LOLLIPOP_AUTHORIZER_CASES, 'register-it-signature-validation-error');
    const evaluator = new ConditionEvaluator();
    const signatureError =
      'ERROR Validazione fallita - ErrorCode: SIGNATURE_VALIDATION_ERROR - Message: The assetion signature is not valid';

    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        lambdaLogContext([signatureError, "entityID: 'https://spid.register.it'"]),
      ),
      true,
    );
    assert.strictEqual(
      evaluator.evaluate(knownCase.condition, lambdaLogContext([signatureError, "entityID: 'https://idp.example.it'"])),
      false,
    );
  });

  it('builds the lambda runbooks without validation errors', () => {
    assert.doesNotThrow(() => buildTokenExchangeLambdaRunbook());
    assert.doesNotThrow(() => buildIoAuthorizerLambdaRunbook());
    assert.doesNotThrow(() => buildSlaViolationCheckerLambdaSqsRunbook());
    assert.doesNotThrow(() => buildJwksCacheRefreshLambdaLogInvocationErrorsAlarmRunbook());
    assert.doesNotThrow(() => buildApiKeyAuthorizerV2LambdaLogInvocationErrorsAlarmRunbook());
    assert.doesNotThrow(() => buildDeliveryInsertTriggerEbLambdaLogInvocationErrorsAlarmRunbook());
    assert.doesNotThrow(() => buildLollipopAuthorizerLambdaLogInvocationErrorsAlarmRunbook());
  });
});
