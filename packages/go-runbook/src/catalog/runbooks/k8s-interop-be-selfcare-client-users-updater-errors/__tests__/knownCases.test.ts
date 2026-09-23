import { SELFCARE_USERS_UPDATER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { KNOWN_CASES } from '../knownCases.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { ConditionEvaluator, INTEROP_DOWNSTREAMS, type RunbookContext } from '../../framework.js';

interface LogRowField {
  readonly field: string;
  readonly value: string;
}

const DOCUMENTED_MESSAGES: ReadonlyArray<string> = [
  'The coordinator is not aware of this member',
  'The group coordinator is not available',
  'Crash: KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
  'Connection error: read ECONNRESET',
  "The coordinator is loading and hence can't process requests for this group",
  'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: Request Metadata(key: 3, version: 6) timed out',
  'ERROR - Connection error: read ECONNRESET',
  'Crash: KafkaJSNumberOfRetriesExceeded: Request Metadata(key: 3, version: 6) timed out',
];

function applicationLogRows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<LogRowField>> {
  return messages.map((message) => [
    { field: '@timestamp', value: '2026-07-15 10:00:00.000' },
    { field: 'pod_app', value: SELFCARE_USERS_UPDATER_ALARM.podApp },
    { field: '@message', value: message },
  ]);
}

function context(stepResults: ReadonlyArray<readonly [string, unknown]>): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-07-15T10:00:00.000Z'),
    stepResults: new Map<string, unknown>(stepResults),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('INTEROP Selfcare users updater known cases', () => {
  const evaluator = new ConditionEvaluator();
  const knownCase = KNOWN_CASES[0];

  it('declares a single stable known case for the Selfcare Kafka failures', () => {
    assert.ok(knownCase !== undefined);
    assert.strictEqual(knownCase.id, 'selfcare-kafka-broker-communication-errors');
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [INTEROP_DOWNSTREAMS.SELFCARE]);
    assert.deepStrictEqual(knownCase.analysis?.links, [
      { url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' },
    ]);
    assert.ok((knownCase.analysis?.finalActions?.length ?? 0) > 0);
  });

  it('matches every error signature documented in the runbook', () => {
    assert.ok(knownCase !== undefined);
    for (const message of DOCUMENTED_MESSAGES) {
      const ctx = context([[SELFCARE_USERS_UPDATER_ALARM.stepIds.queryApplicationLogs, applicationLogRows([message])]]);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true, `expected match: ${message}`);
    }
  });

  it('matches the spaced KafkaJS error variant and CID tracker evidence', () => {
    assert.ok(knownCase !== undefined);
    const rows = applicationLogRows([
      'Crash: KafkaJS NumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
    ]);
    const ctx = context([[SELFCARE_USERS_UPDATER_ALARM.stepIds.queryCidTracker, [{ cid: 'cid-1', rows }]]]);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true);
  });

  it('does not classify a generic connection reset as the documented case', () => {
    assert.ok(knownCase !== undefined);
    const ctx = context([
      [
        SELFCARE_USERS_UPDATER_ALARM.stepIds.queryApplicationLogs,
        applicationLogRows(['Request failed: read ECONNRESET']),
      ],
    ]);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), false);
  });

  it('does not retain ETIMEDOUT, which is not present in the current Confluence cases', () => {
    assert.ok(knownCase !== undefined);
    const ctx = context([
      [
        SELFCARE_USERS_UPDATER_ALARM.stepIds.queryApplicationLogs,
        applicationLogRows(['Connection error: read ETIMEDOUT']),
      ],
    ]);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), false);
  });
});
