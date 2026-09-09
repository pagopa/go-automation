import { COMPUTE_AGREEMENTS_CONSUMER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConditionEvaluator, INTEROP_DOWNSTREAMS, type KnownCase, type RunbookContext } from '../../framework.js';

import { KNOWN_CASES } from '../knownCases.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';

interface LogRowField {
  readonly field: string;
  readonly value: string;
}

const DOCUMENTED_MESSAGES: ReadonlyMap<string, string> = new Map([
  [
    'compute-agreements-kafka-wrong-group-coordinator',
    'Error when calling eachMessage - Error: [compute-agreements-consumer] - ' +
      '[CID=f672700a-8f22-4d0e-9055-5ea8f1991e35] [ET=TenantCertifiedAttributeAssigned] ' +
      'Error handling Kafka message. Message: This is not the correct coordinator for this group',
  ],
  ['compute-agreements-kafka-member-rejoin', 'The coordinator is not aware of this member, re-joining the group'],
  [
    'compute-agreements-tls-connection-error',
    'Connection error: Client network socket disconnected before secure TLS connection was established',
  ],
]);

function applicationLogRows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<LogRowField>> {
  return messages.map((message) => [
    { field: '@timestamp', value: '2026-08-31 13:07:08.632' },
    { field: 'pod_app', value: COMPUTE_AGREEMENTS_CONSUMER_ALARM.podApp },
    { field: '@message', value: message },
  ]);
}

function context(stepResults: ReadonlyArray<readonly [string, unknown]>): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-08-31T13:07:08.632Z'),
    stepResults: new Map<string, unknown>(stepResults),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

function knownCaseById(id: string): KnownCase {
  const knownCase = KNOWN_CASES.find((candidate) => candidate.id === id);
  assert.ok(knownCase !== undefined, `known case not found: ${id}`);
  return knownCase;
}

describe('INTEROP compute agreements consumer known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('declares exactly the three documented cases with unique IDs and priorities', () => {
    assert.strictEqual(KNOWN_CASES.length, 3);
    assert.strictEqual(new Set(KNOWN_CASES.map((knownCase) => knownCase.id)).size, KNOWN_CASES.length);
    assert.strictEqual(new Set(KNOWN_CASES.map((knownCase) => knownCase.priority)).size, KNOWN_CASES.length);
  });

  it('matches every message documented in the current Confluence revision', () => {
    for (const knownCase of KNOWN_CASES) {
      const message = DOCUMENTED_MESSAGES.get(knownCase.id);
      assert.ok(message !== undefined, `missing fixture for known case: ${knownCase.id}`);
      const ctx = context([
        [COMPUTE_AGREEMENTS_CONSUMER_ALARM.stepIds.queryApplicationLogs, applicationLogRows([message])],
      ]);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true, `expected match: ${knownCase.id}`);
    }
  });

  it('matches documented evidence returned by the CID tracker, including JSON-encoded logs', () => {
    const knownCase = knownCaseById('compute-agreements-tls-connection-error');
    const message = DOCUMENTED_MESSAGES.get(knownCase.id);
    assert.ok(message !== undefined);
    const rows = applicationLogRows([JSON.stringify({ log: message })]);
    const ctx = context([[COMPUTE_AGREEMENTS_CONSUMER_ALARM.stepIds.queryCidTracker, [{ cid: 'cid-1', rows }]]]);

    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true);
  });

  it('does not broaden the cases to undocumented generic Kafka or network errors', () => {
    const wrongCoordinator = knownCaseById('compute-agreements-kafka-wrong-group-coordinator');
    const memberRejoin = knownCaseById('compute-agreements-kafka-member-rejoin');
    const tls = knownCaseById('compute-agreements-tls-connection-error');
    const ctx = context([
      [
        COMPUTE_AGREEMENTS_CONSUMER_ALARM.stepIds.queryApplicationLogs,
        applicationLogRows([
          'The group coordinator is not available',
          'KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
          'Request failed: Client network socket disconnected before secure TLS connection was established',
        ]),
      ],
    ]);

    assert.strictEqual(evaluator.evaluate(wrongCoordinator.condition, ctx), false);
    assert.strictEqual(evaluator.evaluate(memberRejoin.condition, ctx), false);
    assert.strictEqual(evaluator.evaluate(tls.condition, ctx), false);
  });

  it('keeps every conditional or unresolved resolution open and maps the documented downstream NA', () => {
    for (const knownCase of KNOWN_CASES) {
      assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
      assert.strictEqual(knownCase.analysis?.analysisType, 'ANALYZABLE');
      assert.deepStrictEqual(knownCase.analysis?.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
      assert.ok((knownCase.analysis?.finalActions?.length ?? 0) > 0);
    }
  });

  it('preserves the Jira and Slack references declared for the first case only', () => {
    const firstCase = knownCaseById('compute-agreements-kafka-wrong-group-coordinator');
    assert.deepStrictEqual(firstCase.analysis?.links, [
      { url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1773057607941239',
        name: 'Thread Slack 09/03/2026',
        type: 'SLACK',
      },
    ]);
    assert.strictEqual(knownCaseById('compute-agreements-kafka-member-rejoin').analysis?.links, undefined);
    assert.strictEqual(knownCaseById('compute-agreements-tls-connection-error').analysis?.links, undefined);
  });
});
