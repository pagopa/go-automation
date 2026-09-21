import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ResultField } from '@go-automation/go-common/aws';

import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { ConditionEvaluator } from '../../framework.js';
import type { KnownCase, RunbookContext } from '../../framework.js';
import { KNOWN_CASES } from '../knownCases.js';

function contextWithError(message: string): RunbookContext {
  const row: ReadonlyArray<ResultField> = [
    { field: '@timestamp', value: '2026-09-08T14:13:28.000Z' },
    { field: '@requestId', value: 'b95bb742-cc30-4f07-80bc-45a38011e5c4' },
    { field: '@message', value: message },
  ];

  return {
    executionId: 'test',
    startedAt: new Date('2026-09-08T14:14:00.000Z'),
    stepResults: new Map([['query-lambda-errors', [row]]]),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

function byId(id: string): KnownCase {
  const knownCase = KNOWN_CASES.find((candidate) => candidate.id === id);
  assert.ok(knownCase !== undefined, `known case not found: ${id}`);
  return knownCase;
}

describe('pn-downstream-monitoring-lambda known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('matches the complete SlowDown 503 signature documented in Confluence', () => {
    const message =
      'ERROR\tInvoke Error\t{"errorType":"SlowDown","errorMessage":"Please reduce your request rate.","$fault":"server","$metadata":{"httpStatusCode":503,"requestId":"request-1"}}';
    const knownCase = byId('downstream-monitoring-aws-slow-down');

    assert.strictEqual(evaluator.evaluate(knownCase.condition, contextWithError(message)), true);
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.match(knownCase.analysis?.resolution ?? '', /account core/u);
    assert.match(knownCase.analysis?.resolution ?? '', /account confinfo/u);
    assert.match(knownCase.analysis?.resolution ?? '', /Written <N> record\(s\)/u);
  });

  it('does not match a generic HTTP 503 or an incomplete SlowDown message', () => {
    const knownCase = byId('downstream-monitoring-aws-slow-down');

    assert.strictEqual(
      evaluator.evaluate(knownCase.condition, contextWithError('ERROR downstream returned HTTP 503')),
      false,
    );
    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        contextWithError('ERROR Invoke Error {"errorType":"SlowDown","httpStatusCode":503}'),
      ),
      false,
    );
  });
});
