import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AnalyzeInteropCidTrackerStep } from '../AnalyzeInteropCidTrackerStep.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';

describe('AnalyzeInteropCidTrackerStep', () => {
  it('aggregates pod apps, messages and returns resolve for known-error evaluation', async () => {
    const step = new AnalyzeInteropCidTrackerStep({ id: 'analyze-cid', label: 'Analyze CID', fromStep: 'query-cid' });

    const result = await step.execute(
      createTestContext({
        stepResults: {
          'query-cid': [
            { cid: 'cid-1', rows: [logRow({ pod_app: 'purpose-process', '@message': 'read ECONNRESET' })] },
            { cid: 'cid-2', rows: [logRow({ pod_app: 'interop-be-backend-for-frontend', log: 'jwt expired' })] },
          ],
        },
      }),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.logCount, 2);
    assert.deepStrictEqual(result.output?.podApps, ['interop-be-backend-for-frontend', 'purpose-process']);
    assert.strictEqual(result.vars?.['interopCidTrackerAnalysisCompleted'], 'true');
    assert.strictEqual(result.next, undefined);
  });
});
