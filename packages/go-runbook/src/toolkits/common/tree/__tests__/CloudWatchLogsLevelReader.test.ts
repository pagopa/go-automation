import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogsInsightsResultField, AWSCloudWatchLogsQueryResult } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { EvidenceIdentifier } from '../../../../engine/types/EvidenceIdentifier.js';
import type { OperationalContext } from '../../services/OperationalContext.js';
import { CloudWatchLogsLevelReader } from '../CloudWatchLogsLevelReader.js';
import type { CloudWatchLogsLevelReaderConfig } from '../CloudWatchLogsLevelReaderConfig.js';
import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { fakeCloudWatchLogs } from '../../../../__tests__/helpers/fakeCloudWatchLogs.js';
import { logRow } from '../../../../__tests__/helpers/logRow.js';
import { TEST_TIME_RANGE_PARAMS } from '../../../../__tests__/helpers/TEST_TIME_RANGE_PARAMS.js';
import { captureNarrative } from '../../../../__tests__/helpers/captureNarrative.js';

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

/** The same read with a row limit of 4: a saturated batch can be divided. */
class LimitedKeyLevelReader extends KeyLevelReader {
  protected override query(identifiers: ReadonlyArray<EvidenceIdentifier>): string {
    return `${super.query(identifiers)} | limit 4`;
  }
}

/** The rules of the level of the keys: the identifier of a row is its key, its identity its pointer. */
const KEY_RULES = {
  attribute: (identifier: EvidenceIdentifier) => (row: unknown) =>
    Array.isArray(row) &&
    (row as Rows[number]).some(({ field, value }) => field === 'key' && value === identifier.value),
  rowIdentity: (row: unknown) =>
    Array.isArray(row) ? ((row as Rows[number]).find(({ field }) => field === '@ptr')?.value ?? '') : String(row),
};

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
  it('opens its own section before the query, so the statistics of the query are reported under it', async () => {
    const { reporter, lines } = captureNarrative();
    const cloudWatchLogs = fakeCloudWatchLogs(() => [logRow({ key: 'a' })]);
    await new KeyLevelReader(CONFIG).read(
      createTestContext({ params: TEST_TIME_RANGE_PARAMS, services: { cloudWatchLogs, reporter } }),
      [{ kind: 'traceId', value: 'a' }],
    );
    reporter.flush();
    assert.ok(lines.some((line) => line.includes('Read keys')));
  });
  it('divides a saturated batch and reads its halves, so every identifier is read completely', async () => {
    const queries: string[] = [];
    const rowsOf = (key: string): Rows => [1, 2, 3].map((index) => logRow({ key, '@ptr': `${key}${String(index)}` }));
    const statistics = { bytesScanned: 1, recordsScanned: 6, recordsMatched: 6 };
    const queryWithStatistics = async (
      groups: ReadonlyArray<string>,
      text: string,
    ): Promise<AWSCloudWatchLogsQueryResult> => {
      await Promise.resolve();
      queries.push(text);
      const rows = ['a', 'b'].filter((key) => text.includes(`'${key}'`)).flatMap(rowsOf);
      return {
        rows,
        statistics,
        queryExecutions: [{ queryId: `q${String(queries.length)}`, profile: 'p', logGroups: groups, statistics }],
      };
    };
    const budget = { remaining: 10 };
    const result = await new LimitedKeyLevelReader(CONFIG).read(
      {
        ...createTestContext({
          params: TEST_TIME_RANGE_PARAMS,
          services: { cloudWatchLogs: { query: async () => Promise.resolve([]), queryWithStatistics } },
        }),
        readSplits: budget,
      },
      [
        { kind: 'traceId', value: 'a' },
        { kind: 'traceId', value: 'b' },
      ],
      KEY_RULES,
    );

    assert.strictEqual(queries.length, 3);
    assert.strictEqual(result.rows.length, 6);
    assert.strictEqual(result.coverage, undefined);
    assert.strictEqual(budget.remaining, 8);
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions.length, 3);
  });
});
