import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { InteropK8sAlarmContext } from '../../types/InteropK8sAlarmContext.js';
import type { ResolveInteropAlarmContextFn } from '../../../../alarms/ResolveInteropAlarmContextFn.js';
import { ResolveInteropK8sAlarmContextStep } from '../ResolveInteropK8sAlarmContextStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

const ALARM_CONTEXT: InteropK8sAlarmContext = {
  alarmName: 'k8s-interop-be-backend-for-frontend-errors-att',
  runbookKey: 'k8s-interop-be-backend-for-frontend-errors',
  environment: 'att',
  podApp: 'interop-be-backend-for-frontend',
  logGroup: '/aws/eks/interop-eks-cluster-att/application',
};

function context(params: ReadonlyArray<readonly [string, string]>): ReturnType<typeof createTestContext> {
  return createTestContext({ params: Object.fromEntries(params) });
}

function step(
  resolveAlarmContext: ResolveInteropAlarmContextFn<InteropK8sAlarmContext>,
): ResolveInteropK8sAlarmContextStep {
  return new ResolveInteropK8sAlarmContextStep({
    id: 'resolve-interop-alarm-context',
    label: 'Risoluzione contesto allarme INTEROP k8s',
    resolveAlarmContext,
  });
}

describe('ResolveInteropK8sAlarmContextStep', () => {
  it('resolves the alarm context and exposes it as output and vars', async () => {
    let seenAlarmName: string | undefined;
    const result = await step((alarmName) => {
      seenAlarmName = alarmName;
      return ALARM_CONTEXT;
    }).execute(context([['alarmName', ALARM_CONTEXT.alarmName]]));

    assert.strictEqual(seenAlarmName, ALARM_CONTEXT.alarmName);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, ALARM_CONTEXT);
    assert.deepStrictEqual(result.vars, {
      interopEnvironment: 'att',
      interopPodApp: 'interop-be-backend-for-frontend',
      interopLogGroup: '/aws/eks/interop-eks-cluster-att/application',
      interopRunbookKey: 'k8s-interop-be-backend-for-frontend-errors',
    });
  });

  it('fails without invoking the resolver when alarmName is missing or blank', async () => {
    let calls = 0;
    const resolver = (): InteropK8sAlarmContext => {
      calls += 1;
      return ALARM_CONTEXT;
    };

    const missing = await step(resolver).execute(context([]));
    assert.strictEqual(missing.success, false);
    assert.match(missing.error ?? '', /alarmName/u);

    const blank = await step(resolver).execute(context([['alarmName', '   ']]));
    assert.strictEqual(blank.success, false);
    assert.strictEqual(calls, 0);
  });

  it('reports the alarm name in the trace info', () => {
    const withParam = step(() => ALARM_CONTEXT).getTraceInfo(context([['alarmName', ALARM_CONTEXT.alarmName]]));
    assert.strictEqual(withParam['alarmName'], ALARM_CONTEXT.alarmName);

    const withoutParam = step(() => ALARM_CONTEXT).getTraceInfo(context([]));
    assert.strictEqual(withoutParam['alarmName'], null);
  });

  it('returns a failed step result when the resolver throws', async () => {
    const result = await step(() => {
      throw new RangeError('unsupported fixture alarm');
    }).execute(context([['alarmName', 'fixture-unsupported']]));

    assert.deepStrictEqual(result, {
      success: false,
      error: 'INTEROP k8s alarm context resolution failed (interop-k8s-alarm-context): unsupported fixture alarm',
    });
  });
});
