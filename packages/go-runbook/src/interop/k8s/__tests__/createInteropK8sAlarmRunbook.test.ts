import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createInteropK8sAlarmRunbook, defaultInteropK8sRunbookStepIds } from '../builders/index.js';
import { isServiceRunbookContext } from '../../../service/output/ServiceRunbookContext.js';

const SERVICE_NAME = 'interop-be-backend-for-frontend';

describe('createInteropK8sAlarmRunbook', () => {
  it('builds a read-only service-compatible INTEROP k8s pipeline', () => {
    const runbook = createInteropK8sAlarmRunbook({
      id: 'k8s-interop-be-backend-for-frontend-errors',
      metadata: {
        name: 'k8s-interop-be-backend-for-frontend-errors',
        description: 'Analyze INTEROP k8s BFF errors',
        version: '1.0.0',
        type: 'alarm-resolution',
        team: 'GO',
        tags: ['interop', 'k8s'],
      },
      service: {
        name: SERVICE_NAME,
        logGroup: '/aws/eks/interop-eks-cluster-<environment>/application',
        varPrefix: 'interopBff',
      },
      resolveAlarmContext: (alarmName) => ({
        alarmName,
        runbookKey: 'k8s-interop-be-backend-for-frontend-errors',
        environment: 'prod',
        podApp: SERVICE_NAME,
        logGroup: '/aws/eks/interop-eks-cluster-prod/application',
      }),
      knownCases: [],
      occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    });

    const stepIds = defaultInteropK8sRunbookStepIds(SERVICE_NAME);
    assert.deepStrictEqual(
      runbook.steps.map((descriptor) => descriptor.step.id),
      [
        stepIds.resolveContext,
        stepIds.queryApplicationLogs,
        stepIds.analyzeApplicationLogs,
        stepIds.queryCidTracker,
        stepIds.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.ok(isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, SERVICE_NAME);
  });
});
