import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { queryBatches, readSplittingSaturated } from '../queryBatches.js';
import { logRowIdentity } from '../logRowIdentity.js';
import type { CloudWatchLogsReadAttempt } from '../CloudWatchLogsReadAttempt.js';
import type { CloudWatchLogsRow } from '../CloudWatchLogsRow.js';
import type { ReadSplitBudget } from '../../../../../../engine/index.js';
import { renderServiceLogQuery } from '../../../../../send/families/apigw/queries/renderServiceLogQuery.js';
import { SEND_API_GW_PROFILE } from '../../../../../send/families/apigw/profiles/SEND_API_GW_PROFILE.js';
import type { EvidenceIdentifier } from '../../../../../../engine/index.js';

/** 113 distinct X-Ray trace ids, as many as the requests of an API Gateway alarm with a large incident. */
const TRACES: ReadonlyArray<EvidenceIdentifier> = Array.from({ length: 113 }, (_, index) => ({
  kind: 'traceId',
  value: `1-6ade89e7-${String(index).padStart(24, '0')}`,
}));

describe('queryBatches', () => {
  it('reads the traces of a large SEND incident with one query', () => {
    const query = (batch: ReadonlyArray<EvidenceIdentifier>): string =>
      renderServiceLogQuery(SEND_API_GW_PROFILE.serviceLog, 'send', batch);

    const batches = queryBatches(TRACES, query);

    assert.strictEqual(batches.length, 1);
    assert.ok(query(batches[0] ?? []).length <= 10_000);
  });

  it('closes a batch before its query passes the length StartQuery accepts, and honors the cap', () => {
    const query = (batch: ReadonlyArray<string>): string => batch.join(' or ');
    const items = Array.from({ length: 30 }, () => 'x'.repeat(999));

    const batches = queryBatches(items, query);

    assert.deepStrictEqual(
      batches.map((batch) => batch.length),
      [9, 9, 9, 3],
    );
    assert.ok(batches.every((batch) => query(batch).length <= 10_000));
    assert.deepStrictEqual(
      queryBatches(items, query, 4).map((batch) => batch.length),
      [4, 4, 4, 4, 4, 4, 4, 2],
    );
    assert.deepStrictEqual(queryBatches([], query), []);
  });

  it('keeps an item whose query alone is too long as a batch of its own', () => {
    assert.deepStrictEqual(
      queryBatches(['y'.repeat(20_000), 'z'], (batch) => batch.join('')),
      [['y'.repeat(20_000)], ['z']],
    );
  });
});

/** A row of an item, with its own pointer. */
function row(item: string, index: number): CloudWatchLogsRow {
  return [
    { field: '@ptr', value: `${item}#${String(index)}` },
    { field: 'item', value: item },
  ];
}

/** One query of a batch. */
type ReadBatchFn = (batch: ReadonlyArray<string>) => Promise<CloudWatchLogsReadAttempt>;

/** A scripted read and the batches it was asked for. */
interface ScriptedRead {
  readonly reads: string[][];
  readonly read: ReadBatchFn;
}

/** A read that answers every item with its rows, saturated at `limit` rows; a `failing` item read alone fails. */
function reader(
  rowsOf: Readonly<Record<string, number>>,
  limit: number,
  failing: ReadonlySet<string> = new Set(),
): ScriptedRead {
  const reads: string[][] = [];
  return {
    reads,
    read: async (batch) => {
      await Promise.resolve();
      reads.push([...batch]);
      // A failing item fails the read that asks for it alone.
      if (batch.length === 1 && failing.has(batch[0] ?? '')) {
        return { rows: [], failure: new Error('throttled'), coverage: [{ complete: false, reason: 'unavailable' }] };
      }
      const rows = batch.flatMap((item) => Array.from({ length: rowsOf[item] ?? 0 }, (_, index) => row(item, index)));
      const saturated = rows.length >= limit;
      return {
        rows: rows.slice(0, limit),
        diagnostics: {
          cloudWatchLogs: {
            rowsReturned: Math.min(rows.length, limit),
            statistics: { bytesScanned: 100, recordsScanned: 10, recordsMatched: rows.length },
            queryExecutions: [],
          },
        },
        coverage: saturated
          ? [
              {
                complete: false,
                reason: 'saturated',
                identifiers: batch.map((value) => ({ kind: 'requestId' as const, value })),
              },
            ]
          : [],
      };
    },
  };
}

const belongs = (candidate: CloudWatchLogsRow, item: string): boolean =>
  candidate.find(({ field }) => field === 'item')?.value === item;

describe('readSplittingSaturated', () => {
  it('divides a saturated batch until its halves are complete, keeping every query', async () => {
    const { reads, read } = reader({ a: 3, b: 3, c: 3, d: 3 }, 10);
    const budget: ReadSplitBudget = { remaining: 10 };

    const attempts = await readSplittingSaturated(['a', 'b', 'c', 'd'], {
      read,
      belongs,
      rowIdentity: logRowIdentity,
      budget,
    });

    assert.deepStrictEqual(reads, [
      ['a', 'b', 'c', 'd'],
      ['a', 'b'],
      ['c', 'd'],
    ]);
    assert.strictEqual(attempts.flatMap((attempt) => attempt.rows).length, 12);
    assert.ok(attempts.every((attempt) => attempt.coverage.every((entry) => entry.complete)));
    assert.strictEqual(attempts.filter((attempt) => attempt.diagnostics !== undefined).length, 3);
    assert.strictEqual(budget.remaining, 8);
  });

  it('keeps the rows of the saturated read for a half that stays incomplete or fails, without duplicates', async () => {
    const { read } = reader({ a: 12, b: 2 }, 10, new Set(['b']));

    const attempts = await readSplittingSaturated(['a', 'b'], {
      read,
      belongs,
      rowIdentity: logRowIdentity,
      budget: { remaining: 10 },
    });

    const rows = attempts.flatMap((attempt) => attempt.rows);
    assert.strictEqual(new Set(rows.map(logRowIdentity)).size, rows.length);
    assert.strictEqual(rows.filter((candidate) => belongs(candidate, 'a')).length, 10);
    assert.ok(attempts.every((attempt) => attempt.failure === undefined));
    assert.ok(attempts.some((attempt) => attempt.coverage.some((entry) => entry.reason === 'saturated')));
    assert.ok(attempts.some((attempt) => attempt.coverage.some((entry) => entry.reason === 'unavailable')));
  });

  it('leaves a saturated batch as it is without budget or without the identity of its rows', async () => {
    for (const split of [{ budget: { remaining: 1 }, rowIdentity: logRowIdentity }, { budget: { remaining: 10 } }]) {
      const { reads, read } = reader({ a: 6, b: 6 }, 10);
      const attempts = await readSplittingSaturated(['a', 'b'], { read, belongs, ...split });
      assert.strictEqual(reads.length, 1);
      assert.strictEqual(attempts.length, 1);
      assert.ok(attempts[0]?.coverage.some((entry) => entry.reason === 'saturated'));
    }
  });

  it('returns a failed first read as its only attempt', async () => {
    const { read } = reader({ a: 1 }, 10, new Set(['a']));
    const attempts = await readSplittingSaturated(['a'], {
      read,
      belongs,
      rowIdentity: logRowIdentity,
      budget: { remaining: 10 },
    });
    assert.strictEqual(attempts.length, 1);
    assert.match(attempts[0]?.failure?.message ?? '', /throttled/);
  });
  it('shares one budget between the readers of an execution', async () => {
    const budget: ReadSplitBudget = { remaining: 2 };
    const first = reader({ a: 6, b: 6 }, 10);
    const second = reader({ c: 6, d: 6 }, 10);

    await readSplittingSaturated(['a', 'b'], { read: first.read, belongs, rowIdentity: logRowIdentity, budget });
    await readSplittingSaturated(['c', 'd'], { read: second.read, belongs, rowIdentity: logRowIdentity, budget });

    assert.strictEqual(first.reads.length, 3);
    assert.strictEqual(second.reads.length, 1);
    assert.strictEqual(budget.remaining, 0);
  });
});
