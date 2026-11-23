import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ServiceTraceLevelReader } from '../ServiceTraceLevelReader.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { fakeCloudWatchLogs } from '../../../../../../__tests__/helpers/fakeCloudWatchLogs.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

const TRACE = '1-6789abcd-0123456789abcdef01234567';
const COMPACT = '6789abcd0123456789abcdef01234567';
const OTHER = '1-6789abcd-fedcba9876543210fedcba98';
const PARAMS = { startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-01-01T00:10:00.000Z' };

function messages(rows: ReadonlyArray<unknown>): ReadonlyArray<string | undefined> {
  return rows.map(
    (row) =>
      (row as ReadonlyArray<{ readonly field?: string; readonly value?: string }>).find(
        (field) => field.field === '@message',
      )?.value,
  );
}

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
    assert.ok(query.includes(`(@message like /${TRACE}|${COMPACT}/)`));
    assert.deepEqual(
      result.rows.map((row) => (row as ReadonlyArray<{ readonly value?: string }>).at(-1)?.value),
      ['ERROR of the trace', `ERROR without field, ${TRACE}`],
    );
  });

  it('keeps a row without field only when the message names the trace as a whole token', async () => {
    const cloudWatchLogs = fakeCloudWatchLogs(() => [
      logRow({ '@message': `ERROR hash ab${COMPACT}cd` }),
      logRow({ '@message': `ERROR of ${COMPACT}` }),
    ]);
    const result = await reader("fields @message, trace_id | filter @message like '{{TRACE_ID}}'").read(
      createTestContext({ params: PARAMS, services: { cloudWatchLogs } }),
      [{ kind: 'traceId', value: TRACE }],
    );
    assert.deepEqual(messages(result.rows), [`ERROR of ${COMPACT}`]);
  });

  it('keeps, for a query that reads one trace at a time, every row without a trace field', async () => {
    const cloudWatchLogs = fakeCloudWatchLogs(() => [
      logRow({ level: 'ERROR' }),
      logRow({ level: 'ERROR', trace_id: OTHER }),
      logRow({ level: 'ERROR', trace_id: COMPACT }),
    ]);
    const result = await reader("filter trace_id = '{{TRACE_ID}}' | display @timestamp, level").read(
      createTestContext({ params: PARAMS, services: { cloudWatchLogs } }),
      [{ kind: 'traceId', value: TRACE }],
    );
    assert.equal(result.rows.length, 2);
  });

  it('rejects a query without the trace id placeholder', () => {
    assert.throws(() => reader('fields @message'), /must contain \{\{TRACE_ID\}\}/u);
  });
  it('reads as many traces per query as fit in its length, within the cap of the level', () => {
    const traces = Array.from({ length: 422 }, (_, index) => ({
      kind: 'traceId' as const,
      value: `traceId:${String(index).padStart(8, '0')}-c213-44bd-9d46-e71204834571`,
    }));
    const batch = reader("fields @message | filter @message like '{{TRACE_ID}}' | limit 10000");

    const batches = batch.batches(traces);
    assert.deepStrictEqual(
      batches.map((entries) => entries.length),
      [220, 202],
    );
    assert.ok(batches.every((entries) => batch.batches(entries).length === 1));
    assert.deepStrictEqual(
      batch.batches(traces, 50).map((entries) => entries.length),
      [50, 50, 50, 50, 50, 50, 50, 50, 22],
    );
  });
});
