/**
 * Tests for AlarmAnalyzer
 *
 * Verifies alarm filtering by ignore patterns, summary generation,
 * full analysis (summary + timeline), and total count aggregation.
 * All inputs are static fixtures with realistic CloudWatch HistoryData.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import type { AlarmHistoryItem, HistoryItemType } from '@aws-sdk/client-cloudwatch';

import { AlarmAnalyzer } from '../AlarmAnalyzer.js';
import { Core } from '@go-automation/go-common';

const FIXTURES_DIR = path.join(import.meta.dirname, '__fixtures__');

interface AlarmFixture {
  readonly description: string;
  readonly items: ReadonlyArray<{
    readonly AlarmName: string;
    readonly Timestamp: string;
    readonly HistoryItemType: string;
    readonly HistoryData: string;
  }>;
}

async function loadAlarmItems(): Promise<AlarmHistoryItem[]> {
  const importer = new Core.GOJSONFileImporter<AlarmFixture>({
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

describe('AlarmAnalyzer', () => {
  const analyzer = new AlarmAnalyzer();

  // ── filterAlarms ──────────────────────────────────────────────────

  describe('filterAlarms', () => {
    it('filters ALARM state items only (excludes OK transitions)', async () => {
      const items = await loadAlarmItems();
      const result = analyzer.filterAlarms(items, []);

      // Fixture has 5 ALARM + 1 OK transition → 5 notIgnored
      const alarmNames = result.notIgnored.map((i) => i.AlarmName);
      assert.ok(!alarmNames.includes('pn-core-HighCPU-Alarm') || alarmNames.length === 5);
      assert.strictEqual(result.ignored.length, 0);

      // The OK transition (NewStateValue: "OK") should be filtered out
      assert.strictEqual(result.notIgnored.length + result.ignored.length, 5);
    });

    it('separates ignored alarms by patterns', async () => {
      const items = await loadAlarmItems();
      const patterns = ['-CumulativeAlarm', '-DLQ-HasMessage'];

      const result = analyzer.filterAlarms(items, patterns);

      // pn-core-CumulativeAlarm-test and pn-core-DLQ-HasMessage-test match patterns
      const ignoredNames = result.ignored.map((i) => i.AlarmName);
      assert.ok(ignoredNames.includes('pn-core-CumulativeAlarm-test'));
      assert.ok(ignoredNames.includes('pn-core-DLQ-HasMessage-test'));

      // Remaining ALARM items should be notIgnored
      const notIgnoredNames = result.notIgnored.map((i) => i.AlarmName);
      assert.ok(notIgnoredNames.includes('pn-core-HighCPU-Alarm'));
      assert.ok(notIgnoredNames.includes('pn-delivery-ErrorAlarm'));
    });

    it('returns all ALARM items when no patterns provided', async () => {
      const items = await loadAlarmItems();
      const result = analyzer.filterAlarms(items, []);

      assert.strictEqual(result.ignored.length, 0);
      assert.strictEqual(result.notIgnored.length, 5);
    });

    it('handles empty alarm list', () => {
      const result = analyzer.filterAlarms([], ['-test-']);

      assert.strictEqual(result.notIgnored.length, 0);
      assert.strictEqual(result.ignored.length, 0);
    });

    it('handles items with missing HistoryData', () => {
      const items: AlarmHistoryItem[] = [
        { AlarmName: 'no-data-alarm', Timestamp: new Date(), HistoryItemType: 'Action' },
      ];
      const result = analyzer.filterAlarms(items, []);

      assert.strictEqual(result.notIgnored.length, 0);
      assert.strictEqual(result.ignored.length, 0);
    });

    it('handles items with malformed HistoryData JSON', () => {
      const items: AlarmHistoryItem[] = [
        {
          AlarmName: 'bad-json-alarm',
          Timestamp: new Date(),
          HistoryItemType: 'Action',
          HistoryData: '{invalid json}',
        },
      ];
      const result = analyzer.filterAlarms(items, []);

      assert.strictEqual(result.notIgnored.length, 0);
      assert.strictEqual(result.ignored.length, 0);
    });

    it('escapes special regex characters in patterns', async () => {
      const items = await loadAlarmItems();
      // Patterns with regex special chars should be treated as literals
      const patterns = ['pn-core-HighCPU-Alarm'];

      const result = analyzer.filterAlarms(items, patterns);

      const ignoredNames = result.ignored.map((i) => i.AlarmName);
      for (const name of ignoredNames) {
        assert.strictEqual(name, 'pn-core-HighCPU-Alarm');
      }
    });
  });

  // ── generateSummary ───────────────────────────────────────────────

  describe('generateSummary', () => {
    it('groups and counts alarms by name', async () => {
      const items = await loadAlarmItems();
      const { notIgnored } = analyzer.filterAlarms(items, []);
      const summary = analyzer.generateSummary(notIgnored);

      const cpuEntry = summary.find((s) => s.alarmName === 'pn-core-HighCPU-Alarm');
      assert.ok(cpuEntry);
      assert.strictEqual(cpuEntry.count, 2);

      const deliveryEntry = summary.find((s) => s.alarmName === 'pn-delivery-ErrorAlarm');
      assert.ok(deliveryEntry);
      assert.strictEqual(deliveryEntry.count, 1);
    });

    it('sorts summary by alarm name alphabetically', async () => {
      const items = await loadAlarmItems();
      const { notIgnored } = analyzer.filterAlarms(items, []);
      const summary = analyzer.generateSummary(notIgnored);

      const names = summary.map((s) => s.alarmName);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      assert.deepStrictEqual(names, sorted);
    });

    it('returns empty array for empty input', () => {
      const summary = analyzer.generateSummary([]);
      assert.deepStrictEqual(summary, []);
    });

    it('skips items without AlarmName', () => {
      const items: AlarmHistoryItem[] = [{ Timestamp: new Date(), HistoryItemType: 'Action' }];
      const summary = analyzer.generateSummary(items);
      assert.deepStrictEqual(summary, []);
    });
  });

  // ── generateFullAnalysis ──────────────────────────────────────────

  describe('generateFullAnalysis', () => {
    it('returns both summary and timeline in single pass', async () => {
      const items = await loadAlarmItems();
      const { notIgnored } = analyzer.filterAlarms(items, []);
      const analysis = analyzer.generateFullAnalysis(notIgnored);

      assert.ok(analysis.summary.length > 0);
      assert.ok(analysis.timeline.length > 0);
      assert.strictEqual(analysis.summary.length, analysis.timeline.length);
    });

    it('timeline contains correct timestamps per alarm', async () => {
      const items = await loadAlarmItems();
      const { notIgnored } = analyzer.filterAlarms(items, []);
      const analysis = analyzer.generateFullAnalysis(notIgnored);

      const cpuTimeline = analysis.timeline.find((t) => t.alarmName === 'pn-core-HighCPU-Alarm');
      assert.ok(cpuTimeline);
      assert.strictEqual(cpuTimeline.timestamps.length, 2);
    });

    it('summary matches generateSummary output', async () => {
      const items = await loadAlarmItems();
      const { notIgnored } = analyzer.filterAlarms(items, []);

      const summaryOnly = analyzer.generateSummary(notIgnored);
      const { summary: fullSummary } = analyzer.generateFullAnalysis(notIgnored);

      assert.deepStrictEqual(fullSummary, summaryOnly);
    });

    it('returns empty results for empty input', () => {
      const analysis = analyzer.generateFullAnalysis([]);

      assert.deepStrictEqual(analysis.summary, []);
      assert.deepStrictEqual(analysis.timeline, []);
    });
  });

  // ── getTotalCount ─────────────────────────────────────────────────

  describe('getTotalCount', () => {
    it('sums counts across all summaries', () => {
      const summaries = [
        { alarmName: 'alarm-1', count: 5 },
        { alarmName: 'alarm-2', count: 3 },
        { alarmName: 'alarm-3', count: 1 },
      ];
      assert.strictEqual(analyzer.getTotalCount(summaries), 9);
    });

    it('returns 0 for empty array', () => {
      assert.strictEqual(analyzer.getTotalCount([]), 0);
    });

    it('works with any object that has count property', () => {
      const items = [
        { count: 10, extra: 'data' },
        { count: 20, extra: 'more' },
      ];
      assert.strictEqual(analyzer.getTotalCount(items), 30);
    });
  });
});
