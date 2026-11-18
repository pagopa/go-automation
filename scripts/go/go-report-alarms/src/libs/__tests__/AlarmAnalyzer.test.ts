/**
 * Tests for AlarmAnalyzer
 *
 * Verifies alarm filtering by ignore patterns, summary generation,
 * full analysis (summary + timeline), and total count aggregation.
 * Inputs come from a static fixture with realistic CloudWatch HistoryData.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';

import { AlarmAnalyzer } from '../AlarmAnalyzer.js';
import type { AlarmHistoryItem, HistoryItemType } from '@pagopa/go-aws/cloudwatch-alarms';
import { GOJSONFileImporter } from '@pagopa/go-common/importers';

const FIXTURES_DIR = path.join(import.meta.dirname, '__fixtures__');

const CPU = 'pn-core-HighCPU-Alarm';
const CUMULATIVE = 'pn-core-CumulativeAlarm-test';
const DLQ = 'pn-core-DLQ-HasMessage-test';
const DELIVERY = 'pn-delivery-ErrorAlarm';

interface AlarmFixture {
  readonly description: string;
  readonly items: ReadonlyArray<{
    readonly AlarmName: string;
    readonly Timestamp: string;
    readonly HistoryItemType: string;
    readonly HistoryData: string;
  }>;
}

/** Loads the fixture: 5 ALARM transitions and 1 OK transition (on the CPU alarm). */
async function loadAlarmItems(): Promise<ReadonlyArray<AlarmHistoryItem>> {
  const importer = new GOJSONFileImporter<AlarmFixture>({
    inputPath: path.join(FIXTURES_DIR, 'alarm-history-items.json'),
  });
  const fixture = await importer.import();
  if (!fixture) throw new Error('Failed to load alarm fixture');

  return fixture.items.map((item) => ({
    ...item,
    Timestamp: new Date(item.Timestamp),
    HistoryItemType: item.HistoryItemType as HistoryItemType,
  }));
}

/** The alarm names of a list of items, sorted for order-insensitive comparison. */
function sortedNames(items: ReadonlyArray<AlarmHistoryItem>): ReadonlyArray<string | undefined> {
  return items.map((item) => item.AlarmName).sort();
}

describe('AlarmAnalyzer', () => {
  const analyzer = new AlarmAnalyzer();
  let items: ReadonlyArray<AlarmHistoryItem> = [];

  before(async () => {
    items = await loadAlarmItems();
  });

  describe('filterAlarms', () => {
    it('keeps only ALARM transitions when no pattern is given', () => {
      const result = analyzer.filterAlarms(items, []);

      // The OK transition of the CPU alarm is dropped.
      assert.deepStrictEqual(sortedNames(result.notIgnored), [CPU, CPU, CUMULATIVE, DLQ, DELIVERY].sort());
      assert.deepStrictEqual(result.ignored, []);
    });

    it('separates the alarms matching an ignore pattern', () => {
      const result = analyzer.filterAlarms(items, ['-CumulativeAlarm', '-DLQ-HasMessage']);

      assert.deepStrictEqual(sortedNames(result.ignored), [CUMULATIVE, DLQ].sort());
      assert.deepStrictEqual(sortedNames(result.notIgnored), [CPU, CPU, DELIVERY].sort());
    });

    it('treats regex special characters in patterns as literals', () => {
      // Unescaped, `.*` would match (and ignore) every alarm.
      const result = analyzer.filterAlarms(items, ['.*', 'pn-core-HighCPU(']);

      assert.deepStrictEqual(result.ignored, []);
      assert.strictEqual(result.notIgnored.length, 5);
    });

    it('drops items whose HistoryData is missing or malformed', () => {
      const result = analyzer.filterAlarms(
        [
          { AlarmName: 'no-data-alarm', Timestamp: new Date(), HistoryItemType: 'Action' },
          { AlarmName: 'bad-json-alarm', Timestamp: new Date(), HistoryItemType: 'Action', HistoryData: '{invalid' },
        ],
        [],
      );

      assert.deepStrictEqual(result, { notIgnored: [], ignored: [] });
    });
  });

  describe('generateSummary and generateFullAnalysis', () => {
    it('groups by name, sorts alphabetically and skips items without a name', () => {
      const { notIgnored } = analyzer.filterAlarms(items, []);
      const input: ReadonlyArray<AlarmHistoryItem> = [...notIgnored, { HistoryItemType: 'Action' }];

      const summary = analyzer.generateSummary(input);

      assert.deepStrictEqual(summary, [
        { alarmName: CUMULATIVE, count: 1 },
        { alarmName: DLQ, count: 1 },
        { alarmName: CPU, count: 2 },
        { alarmName: DELIVERY, count: 1 },
      ]);
      assert.deepStrictEqual(analyzer.generateFullAnalysis(input).summary, summary);
    });

    it('collects the timestamps per alarm, ignoring items without one', () => {
      const { notIgnored } = analyzer.filterAlarms(items, []);

      const { timeline } = analyzer.generateFullAnalysis([...notIgnored, { AlarmName: CPU }, { AlarmName: 'untimed' }]);

      assert.deepStrictEqual(
        timeline.map((entry) => [entry.alarmName, entry.timestamps.length]),
        [
          [CUMULATIVE, 1],
          [DLQ, 1],
          [CPU, 2],
          [DELIVERY, 1],
          ['untimed', 0],
        ],
      );
    });
  });

  describe('getTotalCount', () => {
    it('sums the counts of any object carrying one', () => {
      assert.strictEqual(
        analyzer.getTotalCount([
          { alarmName: 'alarm-1', count: 5 },
          { alarmName: 'alarm-2', count: 3 },
        ]),
        8,
      );
      assert.strictEqual(analyzer.getTotalCount([]), 0);
    });
  });
});
