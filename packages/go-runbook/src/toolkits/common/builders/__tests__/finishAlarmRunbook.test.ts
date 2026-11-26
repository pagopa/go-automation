import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { INTEROP_K8S_QUERY_PROFILE } from '../../../interop/families/k8s/profiles/INTEROP_K8S_QUERY_PROFILE.js';
import {
  createInteropK8sAlarmRunbook,
  defaultInteropK8sRunbookStepIds,
} from '../../../interop/families/k8s/builders/createInteropK8sAlarmRunbook.js';
import { createServiceAlarmRunbook } from '../../families/service/builders/createServiceAlarmRunbook.js';
import { knownCase } from '../../analysis/knownCase.js';
import type { KnownCase } from '../../../../engine/types/KnownCase.js';
import type { Runbook } from '../../../../engine/types/Runbook.js';
import { SEND_SERVICE_PROFILE } from '../../../send/families/service/profiles/SEND_SERVICE_PROFILE.js';
import { TEST_RUNBOOK_METADATA } from '../../../../__tests__/helpers/TEST_RUNBOOK_METADATA.js';

function caseOn(stepId: string): KnownCase {
  return knownCase({
    id: `case-on-${stepId}`,
    description: 'probe',
    condition: { type: 'contains', ref: `steps.${stepId}`, regex: 'boom' },
    resolution: 'n/a',
    analysis: { proposedStatus: 'COMPLETED', analysisType: 'ANALYZABLE' },
  });
}

function interopK8sRunbook(knownCases: ReadonlyArray<KnownCase>): Runbook {
  return createInteropK8sAlarmRunbook({
    alarm: {
      runbookKey: 'probe-k8s',
      podApp: 'interop-bff',
      varPrefix: 'interopBff',
      logGroup: '/aws/eks/probe',
      alarmNames: ['probe-k8s-prod'],
      stepIds: defaultInteropK8sRunbookStepIds('interop-bff'),
      resolveContext: (alarmName: string) => ({
        alarmName,
        runbookKey: 'probe-k8s',
        environment: 'prod',
        podApp: 'interop-bff',
        logGroup: '/aws/eks/probe',
      }),
    },
    metadata: TEST_RUNBOOK_METADATA,
    queryProfile: INTEROP_K8S_QUERY_PROFILE,
    // Renaming a step is exactly what orphans a case written for the old id.
    stepIds: { queryApplicationLogs: 'query-renamed' },
    knownCases,
  });
}

describe('finishAlarmRunbook known-case step refs', () => {
  it('rejects a case left on a step id the INTEROP k8s runbook renamed, naming the builder the author called', () => {
    assert.throws(
      () => interopK8sRunbook([caseOn('query-interop-bff')]),
      /createInteropK8sAlarmRunbook "probe-k8s": knownCase "case-on-query-interop-bff" references step "query-interop-bff" which is not wired/u,
    );
  });

  it('accepts the same case once it points at the renamed step', () => {
    assert.ok(interopK8sRunbook([caseOn('query-renamed')]));
  });

  it('rejects an unreachable case in a service runbook too', () => {
    assert.throws(
      () =>
        createServiceAlarmRunbook({
          id: 'probe-service',
          metadata: TEST_RUNBOOK_METADATA,
          service: { name: 'pn-foo', logGroup: '/aws/ecs/probe', varPrefix: 'foo' },
          knownCases: [caseOn('query-pn-bar')],
          queryProfile: SEND_SERVICE_PROFILE,
          product: 'SEND',
        }),
      /references step "query-pn-bar" which is not wired/u,
    );
  });
});
