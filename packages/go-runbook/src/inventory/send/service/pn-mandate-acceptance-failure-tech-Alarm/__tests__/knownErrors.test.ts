import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConditionEvaluator, type RunbookContext } from '../../../../../engine/index.js';
import { KNOWN_ERRORS } from '../knownErrors.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';

function contextWithDetail(
  detail: string,
  auditMessage = '[AUD_DL_ACCEPT] FAILURE - CIE Data missing values',
): RunbookContext {
  const exception = `pn-exception 400 catched problem=class Problem {
    type: GENERIC_ERROR
    status: 400
    title: Mandate Bad Request
    detail: CIE Data missing values
    errors: [{
        code: PN_MANDATE_BADREQUEST
        element: null
        detail: ${detail}
    }]
  }`;

  return createTestContext({
    vars: { mandateErrorMsg: auditMessage },
    stepResults: {
      'query-pn-mandate': [
        logRow({
          '@timestamp': '2026-08-28T12:00:00.000Z',
          level: 'ERROR',
          message: auditMessage,
          trace_id: 'trace-1',
          aud_type: 'AUD_DL_ACCEPT',
          mandate_workflow_type: 'CIE',
          error_category: 'TECH',
        }),
      ],
      'query-pn-mandate-trace': [
        logRow({ '@timestamp': '2026-08-28T12:00:00.100Z', level: 'ERROR', '@message': exception }),
      ],
    },
  });
}

describe('pn-mandate acceptance failure known errors', () => {
  const evaluator = new ConditionEvaluator();

  it('matches both documented missing NIS field variants', () => {
    const knownError = KNOWN_ERRORS[0];
    assert.ok(knownError !== undefined);

    for (const field of ['nisData.pub_key', 'nisData.sod']) {
      assert.strictEqual(
        evaluator.evaluate(knownError.condition, contextWithDetail(`Missing or empty field: ${field}`)),
        true,
        `expected documented variant to match: ${field}`,
      );
    }
  });

  it('does not broaden the case to another missing field or another audit failure', () => {
    const knownError = KNOWN_ERRORS[0];
    assert.ok(knownError !== undefined);

    assert.strictEqual(
      evaluator.evaluate(knownError.condition, contextWithDetail('Missing or empty field: nisData.nis')),
      false,
    );
    assert.strictEqual(
      evaluator.evaluate(
        knownError.condition,
        contextWithDetail('Missing or empty field: nisData.sod', '[AUD_DL_ACCEPT] FAILURE - Other failure'),
      ),
      false,
    );
  });
});
