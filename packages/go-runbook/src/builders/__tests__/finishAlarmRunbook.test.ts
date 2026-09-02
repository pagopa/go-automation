import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { INTEROP_K8S_QUERY_PROFILE } from '../../interop/k8s/profiles/INTEROP_K8S_QUERY_PROFILE.js';
import { createInteropK8sAlarmRunbook } from '../../interop/k8s/builders/createInteropK8sAlarmRunbook.js';
import { createServiceAlarmRunbook } from '../../service/builders/createServiceAlarmRunbook.js';
import { knownCase } from '../knownCase.js';
import type { KnownCase } from '../../types/KnownCase.js';
import type { Runbook } from '../../types/Runbook.js';

const METADATA = {
  name: 'probe',
  description: '',
  version: '1.0.0',
  type: 'alarm-resolution',
  team: 'GO',
  tags: [],
} as const;

function caseOn(stepId: string): KnownCase {
  return knownCase({
    id: `case-on-${stepId}`,
    description: 'probe',
    priority: 100,
    condition: { type: 'contains', ref: `steps.${stepId}`, regex: 'boom' },
    resolution: 'n/a',
    analysis: { proposedStatus: 'COMPLETED', analysisType: 'ANALYZABLE' },
  });
}

function interopK8sRunbook(knownCases: ReadonlyArray<KnownCase>): Runbook {
  return createInteropK8sAlarmRunbook({
    id: 'probe-k8s',
    metadata: METADATA,
    service: { name: 'interop-bff', logGroup: '/aws/eks/probe', varPrefix: 'interopBff' },
    queryProfile: INTEROP_K8S_QUERY_PROFILE,
    resolveAlarmContext: (alarmName: string) => ({
      alarmName,
      runbookKey: 'probe-k8s',
      environment: 'prod',
      podApp: 'interop-bff',
      logGroup: '/aws/eks/probe',
    }),
    // Renaming a step is exactly what orphans a case written for the old id.
    stepIds: { queryApplicationLogs: 'query-renamed' },
    knownCases,
  });
}

describe('finishAlarmRunbook known-case step refs', () => {
  it('rejects a case left on a step id the INTEROP k8s runbook renamed', () => {
    assert.throws(
      () => interopK8sRunbook([caseOn('query-interop-bff')]),
      /knownCase "case-on-query-interop-bff" references step "query-interop-bff" which is not wired/u,
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
          metadata: METADATA,
          service: { name: 'pn-foo', logGroup: '/aws/ecs/probe', varPrefix: 'foo' },
          knownCases: [caseOn('query-pn-bar')],
        }),
      /references step "query-pn-bar" which is not wired/u,
    );
  });

  it('names the builder the author called, so the error points at the right toolkit', () => {
    assert.throws(() => interopK8sRunbook([caseOn('nowhere')]), /createInteropK8sAlarmRunbook "probe-k8s"/u);
  });
});
