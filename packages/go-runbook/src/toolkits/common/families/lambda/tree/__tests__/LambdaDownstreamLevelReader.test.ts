import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LambdaDownstreamLevelReader } from '../LambdaDownstreamLevelReader.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { fakeCloudWatchLogs } from '../../../../../../__tests__/helpers/fakeCloudWatchLogs.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

const A = '0f3e2b4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const B = '1a1bf5ea-2088-4ea7-9133-12fcbfaabacc';

const reader = new LambdaDownstreamLevelReader({
  id: 'query-downstream',
  label: 'Log del downstream',
  downstream: { name: 'pn-downstream', logGroup: '/aws/lambda/pn-downstream', varPrefix: 'pnDownstream' },
  queryTemplate: 'fields @timestamp, @requestId, @message | filter {{REQUEST_ID_FILTER}}',
  timeRangeFromParams: { start: 'startTime', end: 'endTime' },
});

describe('LambdaDownstreamLevelReader', () => {
  it('reads the batch and keeps only the rows of its invocations', async () => {
    const cloudWatchLogs = fakeCloudWatchLogs(() => [
      logRow({ '@requestId': A, '@message': 'ERROR on A' }),
      logRow({ '@requestId': B, '@message': `ERROR on B, retry of ${A}` }),
    ]);
    const result = await reader.read(
      createTestContext({
        params: { startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-01-01T00:10:00.000Z' },
        services: { cloudWatchLogs },
      }),
      [{ kind: 'requestId', value: A }],
    );
    assert.equal(result.success, true);
    assert.deepEqual(result.rows, [logRow({ '@requestId': A, '@message': 'ERROR on A' })]);
    assert.deepEqual(cloudWatchLogs.queries[0]?.groups, ['/aws/lambda/pn-downstream']);
    assert.ok(cloudWatchLogs.queries[0]?.query.includes(A));
  });
});
