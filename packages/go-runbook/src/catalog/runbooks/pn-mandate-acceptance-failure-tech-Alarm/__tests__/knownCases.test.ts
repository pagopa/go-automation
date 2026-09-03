import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ResultField } from '@go-automation/go-common/aws';

import { ConditionEvaluator, SEND_DOWNSTREAMS } from '../../framework.js';
import type { RunbookContext } from '../../framework.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { KNOWN_CASES } from '../knownCases.js';

function row(fields: Readonly<Record<string, string>>): ReadonlyArray<ResultField> {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

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

  const context: RunbookContext = {
    executionId: 'test',
    startedAt: new Date('2026-08-28T12:00:00.000Z'),
    stepResults: new Map([
      [
        'query-pn-mandate',
        [
          row({
            '@timestamp': '2026-08-28T12:00:00.000Z',
            level: 'ERROR',
            message: auditMessage,
            trace_id: 'trace-1',
            aud_type: 'AUD_DL_ACCEPT',
            mandate_workflow_type: 'CIE',
            error_category: 'TECH',
          }),
        ],
      ],
      [
        'query-pn-mandate-trace',
        [row({ '@timestamp': '2026-08-28T12:00:00.100Z', level: 'ERROR', '@message': exception })],
      ],
    ]),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };

  return context;
}

describe('pn-mandate acceptance failure known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('declares exactly the single case documented by Confluence', () => {
    assert.strictEqual(KNOWN_CASES.length, 1);
    assert.strictEqual(KNOWN_CASES[0]?.id, 'cie-nis-data-missing-values');
  });

  it('matches both documented missing NIS field variants', () => {
    const knownCase = KNOWN_CASES[0];
    assert.ok(knownCase !== undefined);

    for (const field of ['nisData.pub_key', 'nisData.sod']) {
      assert.strictEqual(
        evaluator.evaluate(knownCase.condition, contextWithDetail(`Missing or empty field: ${field}`)),
        true,
        `expected documented variant to match: ${field}`,
      );
    }
  });

  it('does not broaden the case to another missing field or another audit failure', () => {
    const knownCase = KNOWN_CASES[0];
    assert.ok(knownCase !== undefined);

    assert.strictEqual(
      evaluator.evaluate(knownCase.condition, contextWithDetail('Missing or empty field: nisData.nis')),
      false,
    );
    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        contextWithDetail('Missing or empty field: nisData.sod', '[AUD_DL_ACCEPT] FAILURE - Other failure'),
      ),
      false,
    );
  });

  it('keeps the unresolved document case open and preserves its references', () => {
    const knownCase = KNOWN_CASES[0];
    assert.ok(knownCase !== undefined);

    assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(knownCase.analysis?.analysisType, 'ANALYZABLE');
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [SEND_DOWNSTREAMS.NESSUNO]);
    assert.match(knownCase.analysis?.resolution ?? '', /non indica una risoluzione operativa/u);
    assert.strictEqual(knownCase.analysis?.links?.length, 2);
    assert.ok(knownCase.analysis?.links?.every(({ type }) => type === 'SLACK'));
  });
});
