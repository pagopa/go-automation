import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConditionEvaluator, INTEROP_DOWNSTREAMS, type RunbookContext, type ServiceRegistry } from '../../framework.js';

import { KNOWN_CASES } from '../knownCases.js';
import { INTEROP_SELFCARE_ONBOARDING_CONSUMER_SERVICE_NAME } from '../resolveInteropAlarmContext.js';
import { QUERY_INTEROP_APPLICATION_LOGS_STEP_ID, QUERY_INTEROP_CID_TRACKER_STEP_ID } from '../runbookSteps.js';

interface LogRowField {
  readonly field: string;
  readonly value: string;
}

const DOCUMENTED_MESSAGES: ReadonlyArray<string> = [
  'The coordinator is not aware of this member',
  'The group coordinator is not available',
  'Crash: KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
  'Connection error: read ECONNRESET',
  'Connection error: read ETIMEDOUT',
];

function applicationLogRows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<LogRowField>> {
  return messages.map((message) => [
    { field: '@timestamp', value: '2026-08-28 10:00:00.000' },
    { field: 'pod_app', value: INTEROP_SELFCARE_ONBOARDING_CONSUMER_SERVICE_NAME },
    { field: '@message', value: message },
  ]);
}

function context(stepResults: ReadonlyArray<readonly [string, unknown]>): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-08-28T10:00:00.000Z'),
    stepResults: new Map<string, unknown>(stepResults),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

describe('INTEROP Selfcare onboarding consumer known cases', () => {
  const evaluator = new ConditionEvaluator();
  const knownCase = KNOWN_CASES[0];

  it('declares the consolidated Selfcare Kafka case as an actionable downstream issue', () => {
    assert.ok(knownCase !== undefined);
    assert.strictEqual(knownCase.id, 'selfcare-kafka-broker-communication-errors');
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [INTEROP_DOWNSTREAMS.SELFCARE]);
    assert.deepStrictEqual(knownCase.analysis?.links, [
      { url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' },
    ]);
  });

  it('matches every error signature documented in the runbook', () => {
    assert.ok(knownCase !== undefined);
    for (const message of DOCUMENTED_MESSAGES) {
      const ctx = context([[QUERY_INTEROP_APPLICATION_LOGS_STEP_ID, applicationLogRows([message])]]);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true, `expected match: ${message}`);
    }
  });

  it('matches the spaced KafkaJS error variant and CID tracker evidence', () => {
    assert.ok(knownCase !== undefined);
    const rows = applicationLogRows([
      'Crash: KafkaJS NumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
    ]);
    const ctx = context([[QUERY_INTEROP_CID_TRACKER_STEP_ID, [{ cid: 'cid-1', rows }]]]);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true);
  });

  it('does not classify a generic connection reset as the documented Kafka case', () => {
    assert.ok(knownCase !== undefined);
    const ctx = context([
      [QUERY_INTEROP_APPLICATION_LOGS_STEP_ID, applicationLogRows(['Request failed: read ECONNRESET'])],
    ]);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), false);
  });
});
