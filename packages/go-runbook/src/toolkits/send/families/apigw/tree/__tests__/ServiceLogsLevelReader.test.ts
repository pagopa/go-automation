import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ServiceLogsLevelReader } from '../ServiceLogsLevelReader.js';
import { SEND_API_GW_PROFILE } from '../../profiles/SEND_API_GW_PROFILE.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { fakeCloudWatchLogs } from '../../../../../../__tests__/helpers/fakeCloudWatchLogs.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

const TRACE = '1-6789abcd-0123456789abcdef01234567';
const OTHER = '1-6789abcd-fedcba9876543210fedcba98';
const FALLBACK = '0f3e2b4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const PARAMS = { startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-01-01T00:10:00.000Z' };

const reader = new ServiceLogsLevelReader({
  id: 'query-pn-b',
  label: 'Query log pn-b',
  serviceName: 'pn-b',
  logGroups: ['/aws/ecs/pn-b'],
  timeRangeFromParams: { start: 'startTime', end: 'endTime' },
  spec: SEND_API_GW_PROFILE.serviceLog,
  queryProfileId: SEND_API_GW_PROFILE.id,
});

function messages(rows: ReadonlyArray<unknown>): ReadonlyArray<string | undefined> {
  return rows.map(
    (row) =>
      (row as ReadonlyArray<{ readonly field?: string; readonly value?: string }>).find(
        (field) => field.field === '@message',
      )?.value,
  );
}

describe('ServiceLogsLevelReader', () => {
  it('keeps, for a fallback UUID, only the rows with its exact token', async () => {
    const cloudWatchLogs = fakeCloudWatchLogs(() => [
      logRow({ level: 'ERROR', '@message': `Failure FALLBACK-UUID:${FALLBACK}` }),
      logRow({ level: 'ERROR', '@message': `Another request quoting ${FALLBACK}` }),
    ]);
    const result = await reader.read(createTestContext({ params: PARAMS, services: { cloudWatchLogs } }), [
      { kind: 'fallbackUuid', value: FALLBACK },
    ]);
    assert.deepEqual(messages(result.rows), [`Failure FALLBACK-UUID:${FALLBACK}`]);
    assert.ok(cloudWatchLogs.queries[0]?.query.includes(FALLBACK));
  });

  it('drops, for a trace id, the rows whose structured trace is another one', async () => {
    const cloudWatchLogs = fakeCloudWatchLogs(() => [
      logRow({ level: 'ERROR', trace_id: TRACE, '@message': 'Failure of the trace' }),
      logRow({ level: 'ERROR', trace_id: OTHER, '@message': `Failure quoting ${TRACE}` }),
    ]);
    const result = await reader.read(createTestContext({ params: PARAMS, services: { cloudWatchLogs } }), [
      { kind: 'traceId', value: TRACE },
    ]);
    assert.deepEqual(messages(result.rows), ['Failure of the trace']);
  });
});
