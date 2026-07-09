import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ResultField } from '@go-automation/go-common/aws';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import { AnalyzeInteropK8sCidTrackerStep } from '../steps/AnalyzeInteropK8sCidTrackerStep.js';
import type { InteropK8sCidTrackerResult } from '../steps/QueryInteropK8sCidTrackerStep.js';

function row(fields: ReadonlyArray<readonly [string, string]>): ReadonlyArray<ResultField> {
  return fields.map(([field, value]) => ({ field, value }));
}

function context(output: ReadonlyArray<InteropK8sCidTrackerResult>): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-07-09T10:00:00.000Z'),
    stepResults: new Map<string, unknown>([['query-cid', output]]),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

describe('AnalyzeInteropK8sCidTrackerStep', () => {
  it('aggregates pod apps, messages and returns resolve for known-case evaluation', async () => {
    const step = new AnalyzeInteropK8sCidTrackerStep({
      id: 'analyze-cid',
      label: 'Analyze CID',
      fromStep: 'query-cid',
    });

    const result = await step.execute(
      context([
        {
          cid: 'cid-1',
          rows: [
            row([
              ['pod_app', 'purpose-process'],
              ['@message', 'read ECONNRESET'],
            ]),
          ],
        },
        {
          cid: 'cid-2',
          rows: [
            row([
              ['pod_app', 'interop-be-backend-for-frontend'],
              ['log', 'Token verification failed: TokenExpiredError: jwt expired'],
            ]),
          ],
        },
      ]),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.logCount, 2);
    assert.deepStrictEqual(result.output?.podApps, ['interop-be-backend-for-frontend', 'purpose-process']);
    assert.strictEqual(result.vars?.['interopCidTrackerAnalysisCompleted'], 'true');
    assert.strictEqual(result.next, 'resolve');
  });
});
