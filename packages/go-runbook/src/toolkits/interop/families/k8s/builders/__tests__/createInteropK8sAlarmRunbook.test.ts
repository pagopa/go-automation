import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createInteropK8sAlarmRunbook } from '../createInteropK8sAlarmRunbook.js';
import type { InteropK8sAlarmConfig } from '../../types/InteropK8sAlarmConfig.js';
import { isServiceRunbookContext } from '../../../../../common/families/service/output/ServiceRunbookContext.js';

const SERVICE = {
  name: 'interop-be-bff',
  logGroup: '/aws/eks/interop-<environment>/application',
  varPrefix: 'interopBff',
};

function config(overrides: Partial<InteropK8sAlarmConfig> = {}): InteropK8sAlarmConfig {
  return {
    id: 'k8s-interop-be-bff-errors',
    metadata: { name: 'bff', description: '', version: '1.0.0', type: 'alarm-resolution', team: 'GO', tags: [] },
    service: SERVICE,
    resolveAlarmContext: (alarmName) => ({
      alarmName,
      runbookKey: 'k8s-interop-be-bff-errors',
      environment: 'prod',
      podApp: SERVICE.name,
      logGroup: '/aws/eks/interop-prod/application',
    }),
    knownCases: [],
    ...overrides,
  };
}

describe('createInteropK8sAlarmRunbook', () => {
  it('exposes the service context and sets the occurrence window only when declared', () => {
    const runbook = createInteropK8sAlarmRunbook(
      config({ occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 } }),
    );

    assert.ok(isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, SERVICE.name);
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.strictEqual(createInteropK8sAlarmRunbook(config()).occurrenceTimeWindow, undefined);
  });

  it('rejects a blank or malformed id, service name, log group or var prefix', () => {
    const cases: ReadonlyArray<readonly [Partial<InteropK8sAlarmConfig>, RegExp]> = [
      [{ id: ' ' }, /id must be a non-empty string/u],
      [{ service: { ...SERVICE, name: ' ' } }, /service\.name must be a non-empty string/u],
      [{ service: { ...SERVICE, logGroup: '' } }, /service\.logGroup must be a non-empty string/u],
      [{ service: { ...SERVICE, varPrefix: '' } }, /service\.varPrefix must be a non-empty string/u],
      [{ service: { ...SERVICE, name: '-bff' } }, /service\.name "-bff" must be a slug/u],
      [{ service: { ...SERVICE, name: 'bff_x' } }, /must be a slug/u],
      [{ service: { ...SERVICE, varPrefix: '1bff' } }, /service\.varPrefix "1bff" must start with a letter/u],
    ];
    for (const [overrides, error] of cases) {
      assert.throws(() => createInteropK8sAlarmRunbook(config(overrides)), error);
    }
  });
});
