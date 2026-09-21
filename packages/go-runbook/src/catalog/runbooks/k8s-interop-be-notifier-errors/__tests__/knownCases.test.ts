import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { ConditionEvaluator, INTEROP_DOWNSTREAMS, type RunbookContext } from '../../framework.js';
import { NOTIFIER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';

interface LogRowField {
  readonly field: string;
  readonly value: string;
}

const ARCHIVING_SUSPENDED =
  'Error trying to consume a message from SQS - Unable to deserialize json as a CatalogDescriptorState: "ArchivingSuspended"';
const ORGANIZATION_NOT_FOUND =
  'Error trying to consume a message from SQS - No organizationId found associated to 49cd911d-17f4-4955-93cb-d103b82cbdf2';

function applicationLogRows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<LogRowField>> {
  return messages.map((message) => [
    { field: '@timestamp', value: '2026-09-09 10:00:00.000' },
    { field: 'pod_app', value: alarm.podApp },
    { field: '@message', value: message },
  ]);
}

function context(environment: 'prod' | 'att' | 'test', stepId: string, evidence: unknown): RunbookContext {
  return {
    executionId: 'notifier-test',
    startedAt: new Date('2026-09-09T10:00:00.000Z'),
    stepResults: new Map([[stepId, evidence]]),
    vars: new Map([['interopEnvironment', environment]]),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('INTEROP notifier known cases', () => {
  const evaluator = new ConditionEvaluator();
  const archivingCase = KNOWN_CASES[0];
  const organizationCase = KNOWN_CASES[1];

  it('declares unique actionable cases without an external downstream', () => {
    assert.strictEqual(new Set(KNOWN_CASES.map(({ id }) => id)).size, KNOWN_CASES.length);
    assert.strictEqual(new Set(KNOWN_CASES.map(({ priority }) => priority)).size, KNOWN_CASES.length);
    for (const knownCase of KNOWN_CASES) {
      assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
      assert.deepStrictEqual(knownCase.analysis?.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
    }
  });

  it('matches ArchivingSuspended only in prod application evidence', () => {
    assert.ok(archivingCase !== undefined);
    for (const environment of ['prod', 'att', 'test'] as const) {
      const ctx = context(environment, alarm.stepIds.queryApplicationLogs, applicationLogRows([ARCHIVING_SUSPENDED]));
      assert.strictEqual(evaluator.evaluate(archivingCase.condition, ctx), environment === 'prod');
    }
  });

  it('matches a dynamic organization UUID only in test CID tracker evidence', () => {
    assert.ok(organizationCase !== undefined);
    const rows = applicationLogRows([JSON.stringify({ log: ORGANIZATION_NOT_FOUND })]);
    for (const environment of ['prod', 'att', 'test'] as const) {
      const ctx = context(environment, alarm.stepIds.queryCidTracker, [{ cid: 'cid-1', rows }]);
      assert.strictEqual(evaluator.evaluate(organizationCase.condition, ctx), environment === 'test');
    }
  });

  it('does not match an invalid organization identifier or another descriptor state', () => {
    assert.ok(archivingCase !== undefined);
    assert.ok(organizationCase !== undefined);
    const ctx = context(
      'prod',
      alarm.stepIds.queryApplicationLogs,
      applicationLogRows([
        'Error trying to consume a message from SQS - Unable to deserialize json as a CatalogDescriptorState: "Published"',
        'Error trying to consume a message from SQS - No organizationId found associated to unknown',
      ]),
    );
    assert.strictEqual(evaluator.evaluate(archivingCase.condition, ctx), false);
    assert.strictEqual(evaluator.evaluate(organizationCase.condition, ctx), false);
  });
});
