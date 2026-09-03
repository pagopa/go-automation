import { CATALOG_READMODEL_WRITER_SQL_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '../../framework.js';

describe('CATALOG_READMODEL_WRITER_SQL_ALARM.resolveContext', () => {
  it('resolves every environment declared by the Confluence runbook', () => {
    assert.deepStrictEqual(CATALOG_READMODEL_WRITER_SQL_ALARM.alarmNames, [
      'k8s-interop-be-catalog-readmodel-writer-sql-errors-prod',
      'k8s-interop-be-catalog-readmodel-writer-sql-errors-att',
      'k8s-interop-be-catalog-readmodel-writer-sql-errors-test',
    ]);

    for (const alarmName of CATALOG_READMODEL_WRITER_SQL_ALARM.alarmNames) {
      const context = CATALOG_READMODEL_WRITER_SQL_ALARM.resolveContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, CATALOG_READMODEL_WRITER_SQL_ALARM.runbookKey);
      assert.strictEqual(context.logGroup, interop.k8s.buildInteropK8sApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, CATALOG_READMODEL_WRITER_SQL_ALARM.podApp);
    }
  });

  it('rejects alarm names outside the declared INTEROP environments', () => {
    assert.throws(
      () => CATALOG_READMODEL_WRITER_SQL_ALARM.resolveContext('k8s-interop-be-catalog-readmodel-writer-sql-errors-dev'),
      /Unsupported INTEROP alarm name/u,
    );
  });
});
