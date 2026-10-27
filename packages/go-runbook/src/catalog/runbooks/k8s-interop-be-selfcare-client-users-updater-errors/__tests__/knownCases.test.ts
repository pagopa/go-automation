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

const COORDINATOR_MESSAGES: ReadonlyArray<string> = [
  'The coordinator is not aware of this member',
  'The group coordinator is not available',
  'Crash: KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
  "The coordinator is loading and hence can't process requests for this group",
];
const RESET = 'ERROR - Connection error: read ECONNRESET';
const METADATA = 'ERROR - Crash: KafkaJSNumberOfRetriesExceeded: Request Metadata(key: 3, version: 6) timed out';
const TLS = 'Connection error: Client network socket disconnected before secure TLS connection was established';

function applicationLogRows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<LogRowField>> {
  return messages.map((message) => [
    { field: '@timestamp', value: '2026-07-15 10:00:00.000' },
    { field: 'pod_app', value: SELFCARE_USERS_UPDATER_ALARM.podApp },
    { field: '@message', value: message },
  ]);
}

function context(stepResults: ReadonlyArray<readonly [string, unknown]>, environment = 'prod'): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-07-15T10:00:00.000Z'),
    stepResults: new Map<string, unknown>(stepResults),
    vars: new Map([['interopEnvironment', environment]]),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('INTEROP Selfcare users updater known cases', () => {
  const evaluator = new ConditionEvaluator();

  function matches(messages: ReadonlyArray<string>, environment = 'prod'): ReadonlyArray<string> {
    const ctx = context(
      [[SELFCARE_USERS_UPDATER_ALARM.stepIds.queryApplicationLogs, applicationLogRows(messages)]],
      environment,
    );
    return KNOWN_CASES.filter((candidate) => evaluator.evaluate(candidate.condition, ctx)).map(({ id }) => id);
  }

  it('keeps the original coordinator case title, evidence rows and ticket reference', () => {
    const coordinator = KNOWN_CASES.find(({ id }) => id === 'selfcare-kafka-broker-communication-errors');
    assert.ok(coordinator !== undefined);
    assert.strictEqual(coordinator.description, 'Errore di comunicazione KafkaJS verso i broker Selfcare');
    assert.deepStrictEqual(coordinator.analysis?.downstreams, [INTEROP_DOWNSTREAMS.SELFCARE]);
    assert.strictEqual(coordinator.analysis?.resolution, 'PIN-7325');
    assert.deepStrictEqual(coordinator.analysis?.links, [
      { url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' },
    ]);
    assert.strictEqual(coordinator.action.type, 'log');
    if (coordinator.action.type === 'log') {
      assert.deepStrictEqual(
        coordinator.action.details?.map(([label]) => label),
        ['Risoluzione', 'Ambiente', 'Log group', 'Servizio', 'CID analizzati'],
      );
    }
  });

  it('recognizes the documented coordinator and replica signatures in application evidence', () => {
    for (const message of COORDINATOR_MESSAGES) {
      assert.deepStrictEqual(matches([message]), ['selfcare-kafka-broker-communication-errors'], message);
    }
    assert.deepStrictEqual(
      matches([
        'Crash: KafkaJS NumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
      ]),
      ['selfcare-kafka-broker-communication-errors'],
    );
  });

  it('separates ECONNRESET and Metadata timeout without erasing the conflicting source resolutions', () => {
    for (const [message, id] of [
      [RESET, 'selfcare-kafka-connection-reset'],
      [METADATA, 'selfcare-kafka-metadata-timeout'],
    ] as const) {
      assert.deepStrictEqual(matches([message]), [id]);
      assert.deepStrictEqual(matches([message], 'test'), [id]);
      const candidate = KNOWN_CASES.find((item) => item.id === id);
      assert.match(candidate?.analysis?.resolution ?? '', /PIN-7325.*senza risoluzione documentata/u);
      assert.strictEqual(candidate?.analysis?.downstreams, undefined);
    }
  });

  it('recognizes the observed TLS interruption only in production without inventing a resolution', () => {
    assert.deepStrictEqual(matches([TLS]), ['selfcare-kafka-tls-connection-interrupted']);
    assert.deepStrictEqual(matches([`Crash: KafkaJSNumberOfRetriesExceeded: ${TLS}`]), [
      'selfcare-kafka-tls-connection-interrupted',
    ]);
    assert.deepStrictEqual(matches([TLS], 'test'), []);
    const tls = KNOWN_CASES.find(({ id }) => id === 'selfcare-kafka-tls-connection-interrupted');
    assert.strictEqual(tls?.analysis?.resolution, 'Risoluzione non documentata.');
    assert.deepStrictEqual(tls?.analysis?.links, []);
    assert.strictEqual(tls?.analysis?.downstreams, undefined);
  });

  it('does not classify another service from CID tracker evidence', () => {
    const rows = [...COORDINATOR_MESSAGES, RESET, METADATA, TLS].map((message) => [
      { field: 'pod_app', value: 'interop-be-other-service' },
      { field: '@message', value: message },
    ]);
    const ctx = context([
      [SELFCARE_USERS_UPDATER_ALARM.stepIds.queryApplicationLogs, applicationLogRows(['Unknown error [CID=cid-1]'])],
      [SELFCARE_USERS_UPDATER_ALARM.stepIds.queryCidTracker, [{ cid: 'cid-1', rows }]],
    ]);
    for (const candidate of KNOWN_CASES) assert.strictEqual(evaluator.evaluate(candidate.condition, ctx), false);
  });

  it('respects documented environment scopes without treating att as test', () => {
    assert.deepStrictEqual(matches([COORDINATOR_MESSAGES[0] ?? ''], 'test'), []);
    for (const message of COORDINATOR_MESSAGES.slice(1)) {
      assert.deepStrictEqual(matches([message], 'test'), ['selfcare-kafka-broker-communication-errors']);
    }
    assert.deepStrictEqual(matches([...COORDINATOR_MESSAGES, RESET, METADATA, TLS], 'att'), []);
  });

  it('leaves generic resets, timeouts and consumer crash summaries unclassified', () => {
    for (const message of [
      'Request failed: read ECONNRESET',
      'Connection error: read ETIMEDOUT',
      'Error Consumer crashed {"payload":{"error":{"name":"KafkaJSNumberOfRetriesExceeded"}}}',
      'KafkaJSNumberOfRetriesExceeded: Request Metadata(key: 9, version: 9) timed out',
    ])
      assert.deepStrictEqual(matches([message]), []);
  });

  it('keeps every case in progress without recovery or final actions', () => {
    for (const candidate of KNOWN_CASES) {
      assert.strictEqual(candidate.analysis?.proposedStatus, 'IN_PROGRESS');
      assert.strictEqual(candidate.analysis?.analysisType, 'ANALYZABLE');
      assert.deepStrictEqual(candidate.analysis?.finalActions, []);
    }
  });
});
