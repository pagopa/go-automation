import { ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '../../framework.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';

describe('ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.resolveContext', () => {
  it('resolves every environment declared by the Confluence runbook', () => {
    assert.deepStrictEqual(ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.alarmNames, [
      'k8s-interop-be-attribute-registry-readmodel-writer-sql-errors-prod',
      'k8s-interop-be-attribute-registry-readmodel-writer-sql-errors-att',
      'k8s-interop-be-attribute-registry-readmodel-writer-sql-errors-test',
    ]);

    for (const alarmName of ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.alarmNames) {
      const context = ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.resolveContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.runbookKey);
      assert.strictEqual(context.logGroup, interop.k8s.buildInteropK8sApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.podApp);
      assert.strictEqual(
        RUNBOOK_CATALOG.resolveByAlarmName(alarmName)?.descriptor.key,
        ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.runbookKey,
      );
    }
  });

  it('rejects alarm names outside the declared INTEROP environments', () => {
    assert.throws(
      () =>
        ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.resolveContext(
          'k8s-interop-be-attribute-registry-readmodel-writer-sql-errors-dev',
        ),
      /Unsupported INTEROP alarm name/u,
    );
  });

  it('does not register the erroneous sqlr names found in the source prose', () => {
    for (const environment of ['prod', 'att', 'test'] as const) {
      const alarmName = `k8s-interop-be-attribute-registry-readmodel-writer-sqlr-errors-${environment}`;
      assert.throws(
        () => ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM.resolveContext(alarmName),
        /Unsupported INTEROP alarm name/u,
      );
      assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(alarmName), undefined);
    }
  });
});
