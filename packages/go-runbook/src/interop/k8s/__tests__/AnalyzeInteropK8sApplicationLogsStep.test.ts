import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ResultField } from '@go-automation/go-common/aws';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import { AnalyzeInteropK8sApplicationLogsStep } from '../steps/AnalyzeInteropK8sApplicationLogsStep.js';

function context(stepResults: ReadonlyArray<readonly [string, unknown]>): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-07-09T10:00:00.000Z'),
    stepResults: new Map<string, unknown>(stepResults),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

function row(fields: ReadonlyArray<readonly [string, string]>): ReadonlyArray<ResultField> {
  return fields.map(([field, value]) => ({ field, value }));
}

describe('AnalyzeInteropK8sApplicationLogsStep', () => {
  it('extracts CID values from cid, @message and log fields and deduplicates them', async () => {
    const step = new AnalyzeInteropK8sApplicationLogsStep({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'interopBff',
    });

    const result = await step.execute(
      context([
        [
          'query',
          [
            row([
              ['cid', 'cid-1'],
              ['@message', 'first'],
            ]),
            row([['@message', '[CID=cid-2] second']]),
            row([['log', 'log with CID=cid-1] duplicate']]),
            row([['@message', 'without cid']]),
          ],
        ],
      ]),
    );

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output?.cids, ['cid-1', 'cid-2']);
    assert.strictEqual(result.output?.rowsWithoutCidCount, 1);
    assert.strictEqual(result.vars?.['interopBffCidCount'], '2');
    assert.strictEqual(result.vars?.['interopBffRowsWithoutCidCount'], '1');
    assert.strictEqual(result.vars?.['interopBffAnalysisCompleted'], 'true');
  });

  it('uses aggregate counts and errorMessage when a query groups application logs', async () => {
    const step = new AnalyzeInteropK8sApplicationLogsStep({
      id: 'analyze',
      label: 'Analyze',
      fromStep: 'query',
      varPrefix: 'interopAuth',
      countField: 'count',
    });

    const result = await step.execute(
      context([
        [
          'query',
          [
            row([
              ['count', '7'],
              ['cid', 'cid-1'],
              ['errorMessage', 'aggregated warning'],
            ]),
            row([
              ['count', '3'],
              ['errorMessage', 'warning without cid'],
            ]),
          ],
        ],
      ]),
    );

    assert.strictEqual(result.output?.logCount, 10);
    assert.strictEqual(result.output?.rowsWithoutCidCount, 3);
    assert.deepStrictEqual(result.output?.representativeMessages, ['aggregated warning', 'warning without cid']);
    assert.strictEqual(result.vars?.['interopAuthLogCount'], '10');
  });
});
