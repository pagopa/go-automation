import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GOLogger } from '@pagopa/go-common/logging';

import { buildRunbookTelemetry } from '../buildRunbookTelemetry.js';
import { RunbookEngine } from '../../../../engine/core/RunbookEngine.js';
import type { Step } from '../../../../engine/types/Step.js';
import { createTestRunbook } from '../../../../__tests__/helpers/createTestRunbook.js';
import { createTestServiceRegistry } from '../../testing/createTestServiceRegistry.js';

describe('buildRunbookTelemetry', () => {
  it('counts the failed reads, which have no statistics, beside the queries', () => {
    const telemetry = buildRunbookTelemetry({ pipeline: [], readFailures: { cloudWatchLogs: 3 } });

    assert.strictEqual(telemetry?.cloudWatchLogs?.queryCount, 0);
    assert.strictEqual(telemetry?.cloudWatchLogs?.failedQueryCount, 3);
    assert.strictEqual(buildRunbookTelemetry({ pipeline: [] }), undefined);
  });

  it('reads the failures an execution recorded, with one split budget for all its readers', async () => {
    const seen: number[] = [];
    const failing: Step<unknown> = {
      id: 'failing-read',
      label: 'failing read',
      kind: 'data',
      execute: async (context) => {
        seen.push(context.readSplits?.remaining ?? -1);
        context.readFailures?.set('cloudWatchLogs', 1);
        return Promise.resolve({ success: true, output: [] });
      },
    };

    const result = await new RunbookEngine(new GOLogger()).execute(
      createTestRunbook({ steps: [{ step: failing }] }),
      new Map(),
      createTestServiceRegistry(),
    );

    assert.deepStrictEqual(seen, [10]);
    assert.deepStrictEqual(result.trace.readFailures, { cloudWatchLogs: 1 });
    assert.strictEqual(buildRunbookTelemetry(result.trace)?.cloudWatchLogs?.failedQueryCount, 1);
  });
});
