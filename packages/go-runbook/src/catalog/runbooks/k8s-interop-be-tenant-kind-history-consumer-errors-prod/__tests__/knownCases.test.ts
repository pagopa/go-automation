import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConditionEvaluator, type RunbookContext } from '../../framework.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { TENANT_KIND_HISTORY_ALARM as ALARM } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';

const HEARTBEAT = 'ERROR - Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member';
const REFUSED =
  'Connection error: connect ECONNREFUSED The coordinator is not aware of this member, re-joining the group';

function context(
  messages: ReadonlyArray<string>,
  environment = 'prod',
  stepId = ALARM.stepIds.queryApplicationLogs,
): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-10-19T15:26:15.000Z'),
    stepResults: new Map([[stepId, messages.map((value) => [{ field: '@message', value }])]]),
    vars: new Map([['interopEnvironment', environment]]),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

function matches(ctx: RunbookContext): boolean {
  const candidate = KNOWN_CASES[0];
  assert.ok(candidate);
  return new ConditionEvaluator().evaluate(candidate.condition, ctx);
}

describe('Tenant kind history consumer Kafka case', () => {
  for (const [label, message] of [
    ['Heartbeat', HEARTBEAT],
    ['Connection refused and rejoining', REFUSED],
  ] as const) {
    it(`recognizes the documented ${label} signature in raw and structured evidence`, () => {
      assert.equal(matches(context([message])), true);
      assert.equal(matches(context([JSON.stringify({ log: message, pod_app: ALARM.podApp })])), true);
    });
  }

  it('does not extend the production case to other environments', () => {
    for (const environment of ['att', 'test', 'dev'])
      assert.equal(matches(context([HEARTBEAT, REFUSED], environment)), false);
  });

  it('does not generalize undocumented Kafka, network or coordinator signatures', () => {
    for (const message of [
      'Connection error: connect ECONNREFUSED',
      'Connection error: connect ETIMEDOUT',
      'The coordinator is not aware of this member',
      'Response Heartbeat(key: 12, version: 3) - The group coordinator is not available',
      HEARTBEAT.replace('version: 3', 'version: 4'),
      `${HEARTBEAT}Other`,
      'ReadTimeoutException',
    ])
      assert.equal(matches(context([message])), false);
  });

  it('does not combine fragments from separate application rows', () => {
    assert.equal(
      matches(context(['Response Heartbeat(key: 12, version: 3)', 'The coordinator is not aware of this member'])),
      false,
    );
    assert.equal(
      matches(
        context([
          'Connection error: connect ECONNREFUSED',
          'The coordinator is not aware of this member, re-joining the group',
        ]),
      ),
      false,
    );
  });

  it('does not classify another service from shared CID tracker evidence', () => {
    assert.equal(matches(context([HEARTBEAT, REFUSED], 'prod', ALARM.stepIds.queryCidTracker)), false);
  });

  it('preserves both branches of the source notification guidance without inferring closure', () => {
    const candidate = KNOWN_CASES[0];
    assert.equal(KNOWN_CASES.length, 2);
    assert.match(candidate?.analysis?.resolution ?? '', /singole o circoscritte a qualche minuto/u);
    assert.match(candidate?.analysis?.resolution ?? '', /non è necessario segnalarle al team di prodotto/u);
    assert.match(candidate?.analysis?.resolution ?? '', /se la situazione perdura nel tempo, aprire un thread/u);
    assert.equal(candidate?.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.equal(candidate?.analysis?.analysisType, 'ANALYZABLE');
    assert.deepEqual(candidate?.analysis?.finalActions, []);
    assert.equal(candidate?.analysis?.downstreams, undefined);
  });

  it('recognizes only the operation/error pairs observed for the incorrect coordinator', () => {
    const candidate = KNOWN_CASES[1];
    assert.ok(candidate);
    const evaluator = new ConditionEvaluator();
    for (const prefix of [
      'Response Heartbeat(key: 12, version: 3) - ',
      'Response JoinGroup(key: 11, version: 5) - ',
      'Response LeaveGroup(key: 13, version: 3) - ',
      'Crash: KafkaJSNonRetriableError: ',
    ]) {
      const message = `${prefix}This is not the correct coordinator for this group`;
      assert.equal(evaluator.evaluate(candidate.condition, context([message])), true);
      assert.equal(evaluator.evaluate(candidate.condition, context([JSON.stringify({ log: message })])), true);
      assert.equal(evaluator.evaluate(candidate.condition, context([message], 'test')), false);
      assert.equal(
        evaluator.evaluate(candidate.condition, context([message], 'prod', ALARM.stepIds.queryCidTracker)),
        false,
      );
    }
  });

  it('requires an observed operation and coordinator message together in one row', () => {
    const candidate = KNOWN_CASES[1];
    assert.ok(candidate);
    const evaluator = new ConditionEvaluator();
    for (const messages of [
      ['This is not the correct coordinator for this group'],
      ['Response Heartbeat(key: 12, version: 3)', 'This is not the correct coordinator for this group'],
      ['Crash: KafkaJSNonRetriableError: A different error'],
      ['Response Metadata(key: 3, version: 6) - This is not the correct coordinator for this group'],
      ['Error Consumer crashed {"error":{"name":"KafkaJSNonRetriableError"},"restart":false}'],
    ])
      assert.equal(evaluator.evaluate(candidate.condition, context(messages)), false);
  });

  it('keeps the incorrect-coordinator resolution undocumented without extending the first case guidance', () => {
    const candidate = KNOWN_CASES[1];
    assert.equal(candidate?.analysis?.resolution, 'Risoluzione non documentata.');
    assert.equal(candidate?.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.deepEqual(candidate?.analysis?.finalActions, []);
    assert.equal(candidate?.analysis?.downstreams, undefined);
  });
});
