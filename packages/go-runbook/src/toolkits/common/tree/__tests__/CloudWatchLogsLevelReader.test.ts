import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { EvidenceIdentifier } from '../../../../engine/types/EvidenceIdentifier.js';
import type { OperationalContext } from '../../services/OperationalContext.js';
import { CloudWatchLogsLevelReader } from '../CloudWatchLogsLevelReader.js';
import type { CloudWatchLogsLevelReaderConfig } from '../CloudWatchLogsLevelReaderConfig.js';
import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { fakeCloudWatchLogs } from '../../../../__tests__/helpers/fakeCloudWatchLogs.js';
import { logRow } from '../../../../__tests__/helpers/logRow.js';
import { TEST_TIME_RANGE_PARAMS } from '../../../../__tests__/helpers/TEST_TIME_RANGE_PARAMS.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;

interface MessageReaderConfig extends CloudWatchLogsLevelReaderConfig {
  readonly logGroup: string;
}

/** A read of the rows whose `key` field is one of the identifiers. */
class KeyLevelReader extends CloudWatchLogsLevelReader<MessageReaderConfig> {
  readonly reports: number[] = [];

  protected override logGroups(): ReadonlyArray<string> {
    return [this.config.logGroup];
  }

  protected override query(identifiers: ReadonlyArray<EvidenceIdentifier>): string {
    return `filter key in [${identifiers.map(({ value }) => `'${value}'`).join(', ')}]`;
  }

  protected override rowsOf(rows: Rows, identifiers: ReadonlyArray<EvidenceIdentifier>): Rows {
    const wanted = new Set(identifiers.map(({ value }) => value));
    return rows.filter((row) => wanted.has(row.find(({ field }) => field === 'key')?.value ?? ''));
  }

  protected override report(_context: OperationalContext, rowCount: number): void {
    this.reports.push(rowCount);
  }
}

const CONFIG: MessageReaderConfig = {
  id: 'read-keys',
  label: 'Read keys',
  logGroup: '/aws/ecs/keys',
  timeRangeFromParams: { start: 'startTime', end: 'endTime' },
};

describe('CloudWatchLogsLevelReader', () => {
  it('reads a batch with one query, reports it and keeps the rows of the batch', async () => {
    const reader = new KeyLevelReader(CONFIG);
    const cloudWatchLogs = fakeCloudWatchLogs(() => [logRow({ key: 'a' }), logRow({ key: 'z' })]);
    const result = await reader.read(
      createTestContext({ params: TEST_TIME_RANGE_PARAMS, services: { cloudWatchLogs } }),
      [
        { kind: 'traceId', value: 'a' },
        { kind: 'traceId', value: 'b' },
      ],
    );

    assert.deepStrictEqual(result, { success: true, rows: [logRow({ key: 'a' })], diagnostics: result.diagnostics });
    assert.deepStrictEqual(cloudWatchLogs.queries, [
      { groups: ['/aws/ecs/keys'], query: "filter key in ['a', 'b']", resolutionMode: 'search-configured-profiles' },
    ]);
    assert.deepStrictEqual(reader.reports, [2]);
  });

  it('is a data read of CloudWatch Logs, named by its configuration', () => {
    const reader = new KeyLevelReader(CONFIG);
    assert.strictEqual(reader.id, 'read-keys');
    assert.strictEqual(reader.label, 'Read keys');
    assert.strictEqual(reader.kind, 'data');
    assert.deepStrictEqual(reader.requiredServices(), ['cloudWatchLogs']);
  });
});
