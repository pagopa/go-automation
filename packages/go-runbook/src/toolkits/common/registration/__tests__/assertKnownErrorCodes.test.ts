import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestRunbook } from '../../../../__tests__/helpers/createTestRunbook.js';
import type { KnownError } from '../../../../engine/index.js';
import type { BuiltRegistration } from '../BuiltRegistration.js';
import type { RunbookKind } from '../RunbookKind.js';
import { assertKnownErrorCodes } from '../assertKnownErrorCodes.js';

function knownError(code: string, description = 'Caso'): KnownError {
  return {
    code,
    description,
    condition: { type: 'exists', ref: 'vars.x' },
    action: { type: 'log', level: 'info', title: description },
  };
}

function registration(id: string, kind: RunbookKind, ...knownErrors: KnownError[]): BuiltRegistration {
  return {
    runbook: createTestRunbook({ metadata: { ...createTestRunbook().metadata, id }, knownErrors }),
    product: 'SEND',
    kind,
  };
}

describe('assertKnownErrorCodes', () => {
  it('accepts distinct codes and a COMMON known error, equal in content, in several runbooks', () => {
    const common = 'SEND_LAMBDA_COMMON_LAM-TIM';
    assert.doesNotThrow(() =>
      assertKnownErrorCodes([
        registration('a', 'LAMBDA', knownError(common), knownError('SEND_LAMBDA_A_ONE')),
        registration('b', 'LAMBDA', { ...knownError(common) }, knownError('SEND_LAMBDA_B_ONE')),
      ]),
    );
  });

  it('rejects a code out of form', () => {
    assert.throws(
      () => assertKnownErrorCodes([registration('a', 'LAMBDA', knownError('lambda-timeout'))]),
      /is not <PRODUCT>_<FAMILY>/,
    );
  });

  it('rejects a code that does not start with the product and the family of its runbook', () => {
    assert.throws(
      () => assertKnownErrorCodes([registration('a', 'LAMBDA', knownError('SEND_APIGW_A_ONE'))]),
      /does not start with SEND_LAMBDA_/,
    );
  });

  it('rejects a code longer than Watchtower accepts', () => {
    assert.throws(
      () => assertKnownErrorCodes([registration('a', 'LAMBDA', knownError(`SEND_LAMBDA_A_${'X'.repeat(90)}`))]),
      /longer than 100/,
    );
  });

  it('rejects a code that is not COMMON in two runbooks, even with equal declarations', () => {
    assert.throws(
      () =>
        assertKnownErrorCodes([
          registration('a', 'APIGW', knownError('SEND_APIGW_A_ONE')),
          registration('b', 'APIGW', knownError('SEND_APIGW_A_ONE')),
        ]),
      /only an equal COMMON one repeats/,
    );
  });

  it('rejects two different known errors with the same COMMON code', () => {
    assert.throws(
      () =>
        assertKnownErrorCodes([
          registration('a', 'APIGW', knownError('SEND_APIGW_COMMON_ONE')),
          registration('b', 'APIGW', knownError('SEND_APIGW_COMMON_ONE', 'Altro')),
        ]),
      /also a known error of "a"/,
    );
  });
});
