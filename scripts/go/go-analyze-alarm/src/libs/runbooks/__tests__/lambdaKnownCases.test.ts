import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Condition, KnownCase } from '@go-automation/go-runbook';

import { KNOWN_CASES as TOKEN_EXCHANGE_CASES } from '../pn-tokenExchangeLambda-LogInvocationErrors-Alarm/knownCases.js';
import { KNOWN_CASES as IO_AUTHORIZER_CASES } from '../pn-ioAuthorizerLambda-LogInvocationErrors-Alarm/knownCases.js';
import { KNOWN_CASES as SLA_CASES } from '../pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm/knownCases.js';
import { buildTokenExchangeLambdaRunbook } from '../pn-tokenExchangeLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildIoAuthorizerLambdaRunbook } from '../pn-ioAuthorizerLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildSlaViolationCheckerLambdaSqsRunbook } from '../pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm/runbook.js';

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

  it('builds the three lambda runbooks without validation errors', () => {
    assert.doesNotThrow(() => buildTokenExchangeLambdaRunbook());
    assert.doesNotThrow(() => buildIoAuthorizerLambdaRunbook());
    assert.doesNotThrow(() => buildSlaViolationCheckerLambdaSqsRunbook());
  });
});
