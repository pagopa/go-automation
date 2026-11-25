import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createInteropK8sAlarmRunbook, defaultInteropK8sRunbookStepIds } from '../createInteropK8sAlarmRunbook.js';
import type { InteropK8sAlarm } from '../../types/InteropK8sAlarm.js';
import type { InteropK8sAlarmConfig } from '../../types/InteropK8sAlarmConfig.js';
import { isServiceRunbookContext } from '../../../../../common/families/service/output/ServiceRunbookContext.js';
import { QueryInteropPodContextStep } from '../../steps/QueryInteropPodContextStep.js';

const ALARM: InteropK8sAlarm = {
  runbookKey: 'k8s-interop-be-bff-errors',
  podApp: 'interop-be-bff',
  varPrefix: 'interopBff',
  logGroup: '/aws/eks/interop-<environment>/application',
  alarmNames: ['k8s-interop-be-bff-errors-prod'],
  stepIds: defaultInteropK8sRunbookStepIds('interop-be-bff'),
  resolveContext: (alarmName) => ({
    alarmName,
    runbookKey: 'k8s-interop-be-bff-errors',
    environment: 'prod',
    podApp: 'interop-be-bff',
    logGroup: '/aws/eks/interop-prod/application',
  }),
};

function config(overrides: Partial<InteropK8sAlarmConfig> = {}): InteropK8sAlarmConfig {
  return {
    alarm: ALARM,
    metadata: { name: 'bff', description: '', version: '1.0.0', type: 'alarm-resolution', team: 'GO', tags: [] },
    knownCases: [],
    ...overrides,
  };
}

describe('createInteropK8sAlarmRunbook', () => {
  it('builds the runbook of the alarm and sets the occurrence window only when declared', () => {
    const runbook = createInteropK8sAlarmRunbook(
      config({ occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 } }),
    );

    assert.strictEqual(runbook.metadata.id, ALARM.runbookKey);
    assert.ok(isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, ALARM.podApp);
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      Object.values(ALARM.stepIds),
    );
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.strictEqual(createInteropK8sAlarmRunbook(config()).occurrenceTimeWindow, undefined);
  });

  it('rejects a blank or malformed id, service name, log group or var prefix', () => {
    const cases: ReadonlyArray<readonly [Partial<InteropK8sAlarm>, RegExp]> = [
      [{ runbookKey: ' ' }, /id must be a non-empty string/u],
      [{ podApp: ' ' }, /service\.name must be a non-empty string/u],
      [{ logGroup: '' }, /service\.logGroup must be a non-empty string/u],
      [{ varPrefix: '' }, /service\.varPrefix must be a non-empty string/u],
      [{ podApp: '-bff' }, /service\.name "-bff" must be a slug/u],
      [{ podApp: 'bff_x' }, /must be a slug/u],
      [{ varPrefix: '1bff' }, /service\.varPrefix "1bff" must start with a letter/u],
    ];
    for (const [overrides, error] of cases) {
      assert.throws(() => createInteropK8sAlarmRunbook(config({ alarm: { ...ALARM, ...overrides } })), error);
    }
  });

  it('reads the pod context before the CID analysis, keeping the whole episode as evidence', () => {
    const runbook = createInteropK8sAlarmRunbook(
      config({
        podContext: {
          step: {
            id: 'query-bff-context',
            label: 'Contesto del BFF',
            contextName: 'BFF context',
            countVar: 'bffContextLogCount',
            completeness: 'row-limit',
            missingContextError: 'missing',
            incompleteContextError: 'incomplete',
          },
          evidenceId: 'bff-context',
          evidenceLabel: 'Contesto del BFF',
        },
      }),
    );

    const ids = runbook.steps.map(({ step }) => step.id);
    assert.strictEqual(ids[ids.indexOf(ALARM.stepIds.analyzeCidTracker) - 1], 'query-bff-context');
    const descriptor = runbook.steps.find(({ step }) => step.id === 'query-bff-context');
    assert.ok(descriptor?.step instanceof QueryInteropPodContextStep);
    assert.deepStrictEqual(descriptor.evidence, [
      {
        id: 'bff-context',
        label: 'Contesto del BFF',
        type: 'log-sample',
        messageFields: ['log', '@message'],
        retention: { mode: 'all' },
      },
    ]);
  });

  it('records the declared primary resource, the pod app otherwise', () => {
    const declared = createInteropK8sAlarmRunbook(
      config({ primaryResource: { name: ALARM.runbookKey, type: 'Service' } }),
    );
    assert.deepStrictEqual(declared.analysisDefaults?.resources, [
      { name: ALARM.runbookKey, type: 'Service', role: 'PRIMARY' },
    ]);
    assert.deepStrictEqual(createInteropK8sAlarmRunbook(config()).analysisDefaults?.resources, [
      { name: ALARM.podApp, role: 'PRIMARY' },
    ]);
  });
});
