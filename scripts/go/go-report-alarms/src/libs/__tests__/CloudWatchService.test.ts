/**
 * Tests for CloudWatchService
 *
 * Integration tests using aws-sdk-client-mock to verify pagination,
 * date validation, and alarm history retrieval without hitting real AWS.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { mockClient } from 'aws-sdk-client-mock';
import { CloudWatchClient, DescribeAlarmHistoryCommand } from '@aws-sdk/client-cloudwatch';
import type { DescribeAlarmHistoryCommandInput, DescribeAlarmHistoryCommandOutput } from '@aws-sdk/client-cloudwatch';

import { CloudWatchService } from '../CloudWatchService.js';
import { Core } from '@go-automation/go-common';

const FIXTURES_DIR = path.join(import.meta.dirname, '__fixtures__');
const cwMock = mockClient(CloudWatchClient);

/**
 * Loads a fixture and converts Timestamp strings to Date objects,
 * matching the real AWS SDK deserialization behavior.
 */
async function loadAlarmHistoryFixture(name: string): Promise<DescribeAlarmHistoryCommandOutput> {
  const importer = new Core.GOJSONFileImporter<DescribeAlarmHistoryCommandOutput>({
    inputPath: path.join(FIXTURES_DIR, name),
  });
  const data = await importer.import();
  if (!data) throw new Error(`Failed to load fixture: ${name}`);

  if (data.AlarmHistoryItems) {
    for (const item of data.AlarmHistoryItems) {
      if (item.Timestamp && typeof item.Timestamp === 'string') {
        item.Timestamp = new Date(item.Timestamp as unknown as string);
      }
    }
  }

  return data;
}

beforeEach(() => {
  cwMock.reset();
});

describe('CloudWatchService', () => {
  // ── describeAlarmHistory ──────────────────────────────────────────

  describe('describeAlarmHistory', () => {
    it('retrieves alarm history from single page', async () => {
      const page1 = await loadAlarmHistoryFixture('alarm-history-page1.json');
      // Remove NextToken to simulate single page
      cwMock.on(DescribeAlarmHistoryCommand).resolves({ ...page1, NextToken: undefined });

      const client = new CloudWatchClient({});
      const service = new CloudWatchService(client);

      const items = await service.describeAlarmHistory('2025-01-01T00:00:00Z', '2025-01-31T23:59:59Z');

      assert.strictEqual(items.length, 2);
      assert.strictEqual(cwMock.calls().length, 1);
    });

    it('paginates through multiple pages', async () => {
      const page1 = await loadAlarmHistoryFixture('alarm-history-page1.json');
      const page2 = await loadAlarmHistoryFixture('alarm-history-page2.json');

      cwMock.on(DescribeAlarmHistoryCommand).resolvesOnce(page1).resolves(page2);

      const client = new CloudWatchClient({});
      const service = new CloudWatchService(client);

      const items = await service.describeAlarmHistory('2025-01-01T00:00:00Z', '2025-01-31T23:59:59Z');

      assert.strictEqual(items.length, 3); // 2 from page1 + 1 from page2
      assert.strictEqual(cwMock.calls().length, 2);
    });

    it('returns empty array when no alarm history exists', async () => {
      const empty = await loadAlarmHistoryFixture('alarm-history-empty.json');
      cwMock.on(DescribeAlarmHistoryCommand).resolves(empty);

      const client = new CloudWatchClient({});
      const service = new CloudWatchService(client);

      const items = await service.describeAlarmHistory('2025-01-01T00:00:00Z', '2025-01-31T23:59:59Z');

      assert.strictEqual(items.length, 0);
    });

    it('passes alarm name filter to API command', async () => {
      const empty = await loadAlarmHistoryFixture('alarm-history-empty.json');
      cwMock.on(DescribeAlarmHistoryCommand).resolves(empty);

      const client = new CloudWatchClient({});
      const service = new CloudWatchService(client);

      await service.describeAlarmHistory('2025-01-01T00:00:00Z', '2025-01-31T23:59:59Z', 'my-alarm');

      const call = cwMock.calls()[0];
      assert.ok(call);
      const input = call.args[0].input as DescribeAlarmHistoryCommandInput;
      assert.strictEqual(input.AlarmName, 'my-alarm');
    });

    it('sets correct API parameters', async () => {
      const empty = await loadAlarmHistoryFixture('alarm-history-empty.json');
      cwMock.on(DescribeAlarmHistoryCommand).resolves(empty);

      const client = new CloudWatchClient({});
      const service = new CloudWatchService(client);

      await service.describeAlarmHistory('2025-01-01T00:00:00Z', '2025-01-31T23:59:59Z');

      const call = cwMock.calls()[0];
      assert.ok(call);
      const input = call.args[0].input as DescribeAlarmHistoryCommandInput;
      assert.deepStrictEqual(input.AlarmTypes, ['CompositeAlarm', 'MetricAlarm']);
      assert.strictEqual(input.HistoryItemType, 'Action');
      assert.strictEqual(input.ScanBy, 'TimestampDescending');
      assert.strictEqual(input.MaxRecords, 100);
    });
  });

  // ── Date validation ───────────────────────────────────────────────

  describe('date validation', () => {
    it('throws on invalid start date', async () => {
      const client = new CloudWatchClient({});
      const service = new CloudWatchService(client);

      await assert.rejects(
        async () => service.describeAlarmHistory('not-a-date', '2025-01-31T23:59:59Z'),
        /Invalid start date/,
      );
    });

    it('throws on invalid end date', async () => {
      const client = new CloudWatchClient({});
      const service = new CloudWatchService(client);

      await assert.rejects(
        async () => service.describeAlarmHistory('2025-01-01T00:00:00Z', 'not-a-date'),
        /Invalid end date/,
      );
    });

    it('throws when start date is after end date', async () => {
      const client = new CloudWatchClient({});
      const service = new CloudWatchService(client);

      await assert.rejects(
        async () => service.describeAlarmHistory('2025-02-01T00:00:00Z', '2025-01-01T00:00:00Z'),
        /must be before end date/,
      );
    });
  });

  // ── close ─────────────────────────────────────────────────────────

  describe('close', () => {
    it('destroys the CloudWatch client', () => {
      const client = new CloudWatchClient({});
      const service = new CloudWatchService(client);

      // Should not throw
      service.close();
    });
  });
});
