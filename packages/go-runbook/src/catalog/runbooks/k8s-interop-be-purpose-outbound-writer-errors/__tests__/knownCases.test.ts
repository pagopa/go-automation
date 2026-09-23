import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { ConditionEvaluator, INTEROP_DOWNSTREAMS, type RunbookContext } from '../../framework.js';
import { PURPOSE_OUTBOUND_WRITER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';

interface LogRowField {
  readonly field: string;
  readonly value: string;
}

const DOCUMENTED_MESSAGE = 'ERROR - The coordinator is not aware of this member, re-joining the group';

function applicationLogRows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<LogRowField>> {
  return messages.map((message) => [
    { field: '@timestamp', value: '2026-09-09 10:00:00.000' },
    { field: 'pod_app', value: alarm.podApp },
    { field: '@message', value: message },
  ]);
}

function context(stepResults: ReadonlyArray<readonly [string, unknown]>): RunbookContext {
  return {
    executionId: 'purpose-outbound-writer-test',
    startedAt: new Date('2026-09-09T10:00:00.000Z'),
    stepResults: new Map<string, unknown>(stepResults),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('INTEROP purpose outbound writer known cases', () => {
  const evaluator = new ConditionEvaluator();
  const knownCase = KNOWN_CASES[0];

  it('declares the documented transient Kafka case as actionable without a downstream', () => {
    assert.ok(knownCase !== undefined);
    assert.strictEqual(knownCase.id, 'purpose-outbound-writer-kafka-member-rejoin');
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
    assert.deepStrictEqual(knownCase.analysis?.links, undefined);
  });

  it('matches the documented error in the application logs', () => {
    assert.ok(knownCase !== undefined);
    const ctx = context([[alarm.stepIds.queryApplicationLogs, applicationLogRows([DOCUMENTED_MESSAGE])]]);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true);
  });

  it('matches the documented error in JSON-encoded CID tracker evidence', () => {
    assert.ok(knownCase !== undefined);
    const rows = applicationLogRows([JSON.stringify({ log: DOCUMENTED_MESSAGE })]);
    const ctx = context([[alarm.stepIds.queryCidTracker, [{ cid: 'cid-1', rows }]]]);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true);
  });

  it('does not classify a different Kafka coordinator error', () => {
    assert.ok(knownCase !== undefined);
    const ctx = context([
      [alarm.stepIds.queryApplicationLogs, applicationLogRows(['ERROR - The group coordinator is not available'])],
    ]);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), false);
  });
});
