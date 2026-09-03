import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ResultField } from '@go-automation/go-common/aws';

import { ConditionEvaluator } from '../../framework.js';
import type { KnownCase, RunbookContext } from '../../framework.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { KNOWN_CASES } from '../knownCases.js';

function contextWithError(message: string): RunbookContext {
  const row: ReadonlyArray<ResultField> = [
    { field: '@timestamp', value: '2026-08-27T16:00:30.127Z' },
    { field: '@requestId', value: '5761d2d6-a0a6-40df-afab-357b640d31b2' },
    { field: '@message', value: message },
  ];

  return {
    executionId: 'test',
    startedAt: new Date('2026-08-27T16:01:00.000Z'),
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

describe('SenderDashboardDataIndexer known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('matches the stale-data message documented by the current runbook', () => {
    const knownCase = byId('sender-dashboard-data-older-than-threshold');
    const context = contextWithError('ERROR No data in the last 5 days. Last data date: 2024-05-08');

    assert.strictEqual(evaluator.evaluate(knownCase.condition, context), true);
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.match(knownCase.analysis?.resolution ?? '', /ambienti inferiori/u);
    assert.match(knownCase.analysis?.resolution ?? '', /produzione/u);
  });

  it('matches missing and undersized DataLake objects from the verified implementation', () => {
    assert.strictEqual(
      evaluator.evaluate(
        byId('sender-dashboard-datalake-object-not-found').condition,
        contextWithError(
          'ERROR Object not found: send/dashboard_mittenti/json/export-notifications_overview.json in bucket pdnd-example',
        ),
      ),
      true,
    );
    assert.strictEqual(
      evaluator.evaluate(
        byId('sender-dashboard-datalake-file-too-small').condition,
        contextWithError('ERROR File size is less than the minimum size: 1000000 bytes'),
      ),
      true,
    );
  });

  it('does not classify an unrelated application error as a document-specific case', () => {
    const context = contextWithError('ERROR Unexpected application failure');
    const documentCases = KNOWN_CASES.filter((knownCase) => knownCase.priority > 100);

    assert.ok(documentCases.every((knownCase) => !evaluator.evaluate(knownCase.condition, context)));
  });
});
