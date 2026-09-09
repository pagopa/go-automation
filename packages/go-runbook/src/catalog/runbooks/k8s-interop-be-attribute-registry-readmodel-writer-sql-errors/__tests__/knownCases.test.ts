import { ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConditionEvaluator, INTEROP_DOWNSTREAMS, type KnownCase, type RunbookContext } from '../../framework.js';

import { KNOWN_CASES } from '../knownCases.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';

interface LogRowField {
  readonly field: string;
  readonly value: string;
}

const DOCUMENTED_NETWORK_MESSAGES: ReadonlyArray<string> = [
  'ERROR - Connection timeout',
  'ERROR -  Connection error: Client network socket disconnected before secure TLS connection was established',
];

const DOCUMENTED_KAFKA_MESSAGE =
  'The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member';

function applicationLogRows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<LogRowField>> {
  return messages.map((message) => [
    { field: '@timestamp', value: '2026-08-28 10:00:00.000' },
    { field: 'pod_app', value: ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.podApp },
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
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

function knownCaseById(id: string): KnownCase {
  const knownCase = KNOWN_CASES.find((candidate) => candidate.id === id);
  assert.ok(knownCase !== undefined, `known case not found: ${id}`);
  return knownCase;
}

describe('INTEROP attribute registry readmodel writer SQL known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('declares the two documented cases with unique IDs and priorities', () => {
    assert.strictEqual(KNOWN_CASES.length, 2);
    assert.strictEqual(new Set(KNOWN_CASES.map((knownCase) => knownCase.id)).size, KNOWN_CASES.length);
    assert.strictEqual(new Set(KNOWN_CASES.map((knownCase) => knownCase.priority)).size, KNOWN_CASES.length);
  });

  it('matches both documented network messages, including the Confluence whitespace variant', () => {
    const knownCase = knownCaseById('attribute-registry-temporary-network-errors');

    for (const message of DOCUMENTED_NETWORK_MESSAGES) {
      const ctx = context([
        [ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.stepIds.queryApplicationLogs, applicationLogRows([message])],
      ]);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true, `expected match: ${message}`);
    }
  });

  it('matches the documented Kafka coordinator message in CID tracker evidence', () => {
    const knownCase = knownCaseById('attribute-registry-kafka-coordinator-member-rejoin');
    const rows = applicationLogRows([DOCUMENTED_KAFKA_MESSAGE]);
    const ctx = context([
      [ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.stepIds.queryCidTracker, [{ cid: 'cid-1', rows }]],
    ]);

    assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true);
  });

  it('does not broaden the cases to undocumented generic network or Kafka errors', () => {
    const network = knownCaseById('attribute-registry-temporary-network-errors');
    const kafka = knownCaseById('attribute-registry-kafka-coordinator-member-rejoin');
    const ctx = context([
      [
        ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.stepIds.queryApplicationLogs,
        applicationLogRows(['Request failed: Connection timeout', 'The group coordinator is not available']),
      ],
    ]);

    assert.strictEqual(evaluator.evaluate(network.condition, ctx), false);
    assert.strictEqual(evaluator.evaluate(kafka.condition, ctx), false);
  });

  it('keeps unresolved document cases open and maps downstream NA to the INTEROP census', () => {
    for (const knownCase of KNOWN_CASES) {
      assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
      assert.strictEqual(knownCase.analysis?.analysisType, 'ANALYZABLE');
      assert.deepStrictEqual(knownCase.analysis?.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
      assert.ok(knownCase.analysis?.resolution.includes('proseguire l’analisi'));
    }

    assert.deepStrictEqual(knownCaseById('attribute-registry-kafka-coordinator-member-rejoin').analysis?.links, [
      { url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' },
    ]);
  });
});
