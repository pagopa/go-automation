import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { AnalyzeInteropApplicationLogsStep } from '../AnalyzeInteropApplicationLogsStep.js';
import type { InteropK8sApplicationLogAnalysis } from '../InteropK8sApplicationLogAnalysis.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';

async function analyze(
  rows: ReadonlyArray<GOLogsInsightsResultField[]>,
  countField?: string,
): Promise<StepResult<InteropK8sApplicationLogAnalysis>> {
  const step = new AnalyzeInteropApplicationLogsStep({
    id: 'analyze',
    label: 'Analyze',
    fromStep: 'query',
    varPrefix: 'interop',
    ...(countField === undefined ? {} : { countField }),
  });
  return step.execute(createTestContext({ stepResults: { query: rows } }));
}

describe('AnalyzeInteropApplicationLogsStep', () => {
  it('extracts CID values from cid, @message and log fields and deduplicates them', async () => {
    const result = await analyze([
      logRow({ cid: 'cid-1', '@message': 'first' }),
      logRow({ '@message': '[CID=cid-2] second' }),
      logRow({ log: 'log with CID=cid-1] duplicate' }),
      logRow({ '@message': 'without cid' }),
    ]);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output?.cids, ['cid-1', 'cid-2']);
    assert.strictEqual(result.output?.logsWithoutCidCount, 1);
    assert.deepStrictEqual(
      ['CidCount', 'LogsWithoutCidCount', 'RowsWithoutCidCount', 'AnalysisCompleted'].map(
        (k) => result.vars?.[`interop${k}`],
      ),
      ['2', '1', undefined, 'true'],
    );
  });

  it('uses aggregate counts and errorMessage when a query groups application logs', async () => {
    const result = await analyze(
      [
        logRow({ count: '7', cid: 'cid-1', errorMessage: 'aggregated warning' }),
        logRow({ count: '3', errorMessage: 'warning without cid' }),
      ],
      'count',
    );

    assert.strictEqual(result.output?.logCount, 10);
    assert.strictEqual(result.output?.logsWithoutCidCount, 3);
    assert.deepStrictEqual(result.output?.representativeMessages, ['aggregated warning', 'warning without cid']);
    assert.deepStrictEqual(
      ['LogCount', 'LogsWithoutCidCount'].map((k) => result.vars?.[`interop${k}`]),
      ['10', '3'],
    );
  });

  it('uses errorMessage only as a fallback after the existing message fields', async () => {
    const result = await analyze([
      logRow({
        errorMessage: 'aggregated',
        log: 'log warning',
        message: 'message warning',
        '@message': 'cloudwatch warning',
      }),
      logRow({ errorMessage: 'fallback warning' }),
    ]);

    assert.deepStrictEqual(result.output?.representativeMessages, ['cloudwatch warning', 'fallback warning']);
    assert.strictEqual(result.vars?.['interopErrorMsg'], 'cloudwatch warning');
  });
});
