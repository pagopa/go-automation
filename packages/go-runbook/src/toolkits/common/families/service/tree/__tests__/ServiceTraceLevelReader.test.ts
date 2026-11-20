import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ServiceTraceLevelReader } from '../ServiceTraceLevelReader.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { fakeCloudWatchLogs } from '../../../../../../__tests__/helpers/fakeCloudWatchLogs.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

const TRACE = '1-6789abcd-0123456789abcdef01234567';
const COMPACT = '6789abcd0123456789abcdef01234567';
const OTHER = '1-6789abcd-fedcba9876543210fedcba98';

function reader(queryTemplate: string): ServiceTraceLevelReader {
  return new ServiceTraceLevelReader({
    id: 'query-pn-service-trace',
    label: 'Log per trace',
    serviceName: 'pn-service',
    logGroups: ['/aws/ecs/pn-service'],
    queryTemplate,
    queryProfileId: 'send',
    timeRangeFromParams: { start: 'startTime', end: 'endTime' },
  });
}

describe('ServiceTraceLevelReader', () => {
  it('looks up every trace in both forms and drops the rows of another trace', async () => {
    const cloudWatchLogs = fakeCloudWatchLogs(() => [
      logRow({ trace_id: COMPACT, '@message': 'ERROR of the trace' }),
      logRow({ trace_id: OTHER, '@message': `ERROR quoting ${TRACE}` }),
      logRow({ '@message': `ERROR without field, ${TRACE}` }),
    ]);
    const result = await reader("fields @message | filter @message like '{{TRACE_ID}}'").read(
      createTestContext({
        params: { startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-01-01T00:10:00.000Z' },
        services: { cloudWatchLogs },
      }),
      [{ kind: 'traceId', value: TRACE }],
    );
    const query = cloudWatchLogs.queries[0]?.query ?? '';
    assert.ok(query.includes(`@message like '${TRACE}'`));
    assert.ok(query.includes(`@message like '${COMPACT}'`));
    assert.deepEqual(
      result.rows.map((row) => (row as ReadonlyArray<{ readonly value?: string }>).at(-1)?.value),
      ['ERROR of the trace', `ERROR without field, ${TRACE}`],
    );
  });

  it('rejects a query without the trace id placeholder', () => {
    assert.throws(() => reader('fields @message'), /must contain \{\{TRACE_ID\}\}/u);
  });
});
