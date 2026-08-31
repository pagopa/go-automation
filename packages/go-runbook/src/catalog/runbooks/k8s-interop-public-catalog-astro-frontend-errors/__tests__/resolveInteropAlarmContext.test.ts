import { PUBLIC_CATALOG_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '../../framework.js';

describe('PUBLIC_CATALOG_ALARM.resolveContext', () => {
  it('resolves every supported environment-specific alarm to the same canonical runbook key', () => {
    for (const alarmName of PUBLIC_CATALOG_ALARM.alarmNames) {
      const context = PUBLIC_CATALOG_ALARM.resolveContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, PUBLIC_CATALOG_ALARM.runbookKey);
      assert.strictEqual(context.logGroup, interop.k8s.buildInteropK8sApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, 'interop-public-catalog-astro-frontend');
    }
  });

  it('resolves the concrete production alarm name from the operational runbook', () => {
    const context = PUBLIC_CATALOG_ALARM.resolveContext(
      'k8s-interop-public-catalog-astro-frontend-errors-prod-public-catalog',
    );
    assert.strictEqual(context.environment, 'prod');
    assert.strictEqual(context.logGroup, '/aws/eks/interop-eks-cluster-prod/application');
  });

  it('rejects alarm names without the trailing namespace segment or with unknown environments', () => {
    assert.throws(
      () => PUBLIC_CATALOG_ALARM.resolveContext('k8s-interop-public-catalog-astro-frontend-errors-prod'),
      /Unsupported INTEROP alarm name/,
    );
    assert.throws(
      () => PUBLIC_CATALOG_ALARM.resolveContext('k8s-interop-public-catalog-astro-frontend-errors-dev-public-catalog'),
      /Unsupported INTEROP alarm name/,
    );
    assert.throws(
      () => PUBLIC_CATALOG_ALARM.resolveContext(PUBLIC_CATALOG_ALARM.runbookKey),
      /Unsupported INTEROP alarm name/,
    );
  });
});
