import { SELFCARE_ONBOARDING_CONSUMER_ALARM } from '../alarmDefinition.js';
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
];

function applicationLogRows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<LogRowField>> {
  return messages.map((message) => [
    { field: '@timestamp', value: '2026-08-28 10:00:00.000' },
    { field: 'pod_app', value: SELFCARE_ONBOARDING_CONSUMER_ALARM.podApp },
    { field: '@message', value: message },
  ]);
}

function context(stepResults: ReadonlyArray<readonly [string, unknown]>, environment = 'prod'): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-08-28T10:00:00.000Z'),
    stepResults: new Map<string, unknown>(stepResults),
    vars: new Map([['interopEnvironment', environment]]),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('INTEROP Selfcare onboarding consumer known cases', () => {
  const evaluator = new ConditionEvaluator();
  const knownCase = KNOWN_CASES[0];

  it('preserves the original Kafka title, evidence labels, ticket and downstream', () => {
    assert.ok(knownCase !== undefined);
    assert.strictEqual(knownCase.id, 'selfcare-kafka-broker-communication-errors');
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(knownCase.analysis?.downstreams, [INTEROP_DOWNSTREAMS.SELFCARE]);
    assert.deepStrictEqual(knownCase.analysis?.links, [
      { url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' },
    ]);
    assert.strictEqual(knownCase.description, 'Errore di comunicazione KafkaJS verso i broker Selfcare');
    assert.strictEqual(knownCase.analysis?.resolution, 'PIN-7325');
    if (knownCase.action.type === 'log') {
      assert.deepStrictEqual(
        knownCase.action.details?.map(([label]) => label),
        ['Risoluzione', 'Ambiente', 'Log group', 'Servizio', 'CID analizzati'],
      );
    }
  });

  it('matches every error signature documented in the runbook', () => {
    assert.ok(knownCase !== undefined);
    for (const message of DOCUMENTED_MESSAGES) {
      const ctx = context([
        [SELFCARE_ONBOARDING_CONSUMER_ALARM.stepIds.queryApplicationLogs, applicationLogRows([message])],
      ]);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true, `expected match: ${message}`);
    }
  });

  it('matches the spaced KafkaJS error variant in the owning application evidence', () => {
    assert.ok(knownCase !== undefined);
    const rows = applicationLogRows([
      'Crash: KafkaJS NumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
    ]);
    const ctx = context([[SELFCARE_ONBOARDING_CONSUMER_ALARM.stepIds.queryApplicationLogs, rows]]);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true);
  });

  it('does not classify a generic connection reset as the documented Kafka case', () => {
    assert.ok(knownCase !== undefined);
    const ctx = context([
      [
        SELFCARE_ONBOARDING_CONSUMER_ALARM.stepIds.queryApplicationLogs,
        applicationLogRows(['Request failed: read ECONNRESET']),
      ],
    ]);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), false);
  });

  it('does not extend PIN-7325 to undocumented timeout, metadata or TLS signatures', () => {
    assert.ok(knownCase !== undefined);
    for (const message of [
      'Connection error: read ETIMEDOUT',
      'Crash: KafkaJSNumberOfRetriesExceeded: Request Metadata(key: 3, version: 6) timed out',
      'Connection error: Client network socket disconnected before secure TLS connection was established',
    ]) {
      const ctx = context([
        [SELFCARE_ONBOARDING_CONSUMER_ALARM.stepIds.queryApplicationLogs, applicationLogRows([message])],
      ]);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), false);
    }
  });

  it('does not classify another service from a shared CID tracker', () => {
    const ctx = context([
      [
        SELFCARE_ONBOARDING_CONSUMER_ALARM.stepIds.queryCidTracker,
        [
          {
            cid: 'cid-1',
            rows: [
              [
                { field: 'pod_app', value: 'another-service' },
                { field: '@message', value: 'Connection error: read ECONNRESET' },
              ],
            ],
          },
        ],
      ],
    ]);
    for (const candidate of KNOWN_CASES) assert.strictEqual(evaluator.evaluate(candidate.condition, ctx), false);
  });

  for (const [id, message, link] of [
    [
      'selfcare-onboarding-consume-message-conflict',
      'Error consuming message in partition 0 with offset 14961. Reason: AxiosError: Request failed with status code 409',
      'p1791290447067119',
    ],
    [
      'selfcare-onboarding-offset-commit-server-error',
      'Response OffsetCommit(key: 8, version: 5) - The server experienced an unexpected error when processing the request',
      'p1791988082311309',
    ],
  ] as const) {
    it(`recognizes the documented Test-only case: ${id}`, () => {
      const candidate = KNOWN_CASES.find((item) => item.id === id);
      assert.ok(candidate !== undefined);
      const results: ReadonlyArray<readonly [string, unknown]> = [
        [SELFCARE_ONBOARDING_CONSUMER_ALARM.stepIds.queryApplicationLogs, applicationLogRows([message])],
      ];
      assert.strictEqual(evaluator.evaluate(candidate.condition, context(results, 'test')), true);
      for (const environment of ['prod', 'att'])
        assert.strictEqual(evaluator.evaluate(candidate.condition, context(results, environment)), false);
      assert.ok(candidate.analysis?.links?.[0]?.url.endsWith(link));
      assert.match(candidate.analysis?.resolution ?? '', /^Thread Slack /u);
    });
  }

  it('does not apply the Prod Kafka reference to Attestazione or Test', () => {
    assert.ok(knownCase !== undefined);
    const results: ReadonlyArray<readonly [string, unknown]> = [
      [
        SELFCARE_ONBOARDING_CONSUMER_ALARM.stepIds.queryApplicationLogs,
        applicationLogRows(['Connection error: read ECONNRESET']),
      ],
    ];
    for (const environment of ['att', 'test'])
      assert.strictEqual(evaluator.evaluate(knownCase.condition, context(results, environment)), false);
  });

  it('keeps every case in progress without adding procedures or final actions', () => {
    assert.strictEqual(new Set(KNOWN_CASES.map(({ id }) => id)).size, KNOWN_CASES.length);
    assert.strictEqual(new Set(KNOWN_CASES.map(({ priority }) => priority)).size, KNOWN_CASES.length);
    for (const candidate of KNOWN_CASES) {
      assert.strictEqual(candidate.analysis?.proposedStatus, 'IN_PROGRESS');
      assert.deepStrictEqual(candidate.analysis?.finalActions, []);
    }
  });
});
