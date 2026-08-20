import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '../../framework.js';

import {
  INTEROP_PUBLIC_CATALOG_ALARM_NAMES,
  INTEROP_PUBLIC_CATALOG_RUNBOOK_KEY,
  resolveInteropPublicCatalogAlarmContext,
} from '../resolveInteropAlarmContext.js';

describe('resolveInteropPublicCatalogAlarmContext', () => {
  it('resolves every supported environment-specific alarm to the same canonical runbook key', () => {
    for (const alarmName of INTEROP_PUBLIC_CATALOG_ALARM_NAMES) {
      const context = resolveInteropPublicCatalogAlarmContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, INTEROP_PUBLIC_CATALOG_RUNBOOK_KEY);
      assert.strictEqual(context.logGroup, interop.k8s.buildInteropK8sApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, 'interop-public-catalog-astro-frontend');
    }
  });

  it('resolves the concrete production alarm name from the operational runbook', () => {
    const context = resolveInteropPublicCatalogAlarmContext(
      'k8s-interop-public-catalog-astro-frontend-errors-prod-public-catalog',
    );
    assert.strictEqual(context.environment, 'prod');
    assert.strictEqual(context.logGroup, '/aws/eks/interop-eks-cluster-prod/application');
  });

  it('rejects alarm names without the trailing namespace segment or with unknown environments', () => {
    assert.throws(
      () => resolveInteropPublicCatalogAlarmContext('k8s-interop-public-catalog-astro-frontend-errors-prod'),
      /Unsupported INTEROP alarm name/,
    );
    assert.throws(
      () =>
        resolveInteropPublicCatalogAlarmContext('k8s-interop-public-catalog-astro-frontend-errors-dev-public-catalog'),
      /Unsupported INTEROP alarm name/,
    );
    assert.throws(
      () => resolveInteropPublicCatalogAlarmContext(INTEROP_PUBLIC_CATALOG_RUNBOOK_KEY),
      /Unsupported INTEROP alarm name/,
    );
  });
});
