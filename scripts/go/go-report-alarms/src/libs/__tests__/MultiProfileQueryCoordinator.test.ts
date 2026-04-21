/**
 * Tests for MultiProfileQueryCoordinator
 *
 * Integration tests verifying parallel multi-profile query execution,
 * error handling, deduplication, and progress callbacks.
 * Uses aws-sdk-client-mock to intercept CloudWatch API calls.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { mockClient } from 'aws-sdk-client-mock';
import { CloudWatchClient, DescribeAlarmHistoryCommand } from '@aws-sdk/client-cloudwatch';
import type { DescribeAlarmHistoryCommandInput, DescribeAlarmHistoryCommandOutput } from '@aws-sdk/client-cloudwatch';

import { MultiProfileQueryCoordinator } from '../MultiProfileQueryCoordinator.js';
import { Core } from '@go-automation/go-common';
import type { AWS } from '@go-automation/go-common';

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

  // AWS SDK deserializes Timestamp as Date objects; fixtures store them as strings
  if (data.AlarmHistoryItems) {
    for (const item of data.AlarmHistoryItems) {
      if (item.Timestamp && typeof item.Timestamp === 'string') {
        item.Timestamp = new Date(item.Timestamp);
      }
    }
  }

  return data;
}

/**
 * Creates a minimal AWSMultiClientProvider stub.
 * getClientProvider returns an object with a `cloudWatch` property
 * that is a real CloudWatchClient (intercepted by aws-sdk-client-mock).
 */
function createMockProvider(_profiles: ReadonlyArray<string>): AWS.AWSMultiClientProvider {
  return {
    getClientProvider: () => ({
      cloudWatch: new CloudWatchClient({}),
    }),
  } as unknown as AWS.AWSMultiClientProvider;
}

beforeEach(() => {
  cwMock.reset();
});

describe('MultiProfileQueryCoordinator', () => {
  const startDate = '2025-01-01T00:00:00Z';
  const endDate = '2025-01-31T23:59:59Z';

  // ── queryAllProfiles ──────────────────────────────────────────────

  describe('queryAllProfiles', () => {
    it('queries multiple profiles in parallel and aggregates results', async () => {
      const page = await loadAlarmHistoryFixture('alarm-history-page1.json');
      cwMock.on(DescribeAlarmHistoryCommand).resolves({ ...page, NextToken: undefined });

      const profiles = ['sso_pn-core-dev', 'sso_pn-core-uat'];
      const provider = createMockProvider(profiles);
      const coordinator = new MultiProfileQueryCoordinator(provider);

      const result = await coordinator.queryAllProfiles({ profiles, startDate, endDate });

      assert.strictEqual(result.profileCount, 2);
      assert.strictEqual(result.successfulProfiles.length, 2);
      assert.strictEqual(result.failedProfiles.length, 0);
      assert.ok(result.allSucceeded);
      // 2 items per profile, but may be deduplicated (same AlarmName+Timestamp)
      assert.ok(result.totalItemCount > 0);
    });

    it('returns empty result for empty profiles array', async () => {
      const provider = createMockProvider([]);
      const coordinator = new MultiProfileQueryCoordinator(provider);

      const result = await coordinator.queryAllProfiles({ profiles: [], startDate, endDate });

      assert.strictEqual(result.profileCount, 0);
      assert.strictEqual(result.totalItemCount, 0);
      assert.strictEqual(result.successfulProfiles.length, 0);
      assert.strictEqual(result.failedProfiles.length, 0);
      assert.ok(result.allSucceeded);
    });

    it('deduplicates identical profiles', async () => {
      const empty = await loadAlarmHistoryFixture('alarm-history-empty.json');
      cwMock.on(DescribeAlarmHistoryCommand).resolves(empty);

      const profiles = ['sso_pn-core-dev', 'sso_pn-core-dev', 'sso_pn-core-dev'];
      const provider = createMockProvider(profiles);
      const coordinator = new MultiProfileQueryCoordinator(provider);

      const result = await coordinator.queryAllProfiles({ profiles, startDate, endDate });

      // Should deduplicate to 1 unique profile
      assert.strictEqual(result.profileCount, 1);
    });

    it('handles partial profile failures gracefully', async () => {
      // First call succeeds, second call fails
      const page = await loadAlarmHistoryFixture('alarm-history-page1.json');
      let callCount = 0;
      cwMock.on(DescribeAlarmHistoryCommand).callsFake(() => {
        callCount++;
        if (callCount <= 1) {
          return { ...page, NextToken: undefined };
        }
        throw new Error('Profile credentials expired');
      });

      const profiles = ['sso_pn-core-dev', 'sso_pn-core-uat'];
      const provider = createMockProvider(profiles);
      const coordinator = new MultiProfileQueryCoordinator(provider);

      const result = await coordinator.queryAllProfiles({ profiles, startDate, endDate });

      assert.strictEqual(result.successfulProfiles.length, 1);
      assert.strictEqual(result.failedProfiles.length, 1);
      assert.ok(!result.allSucceeded);
      assert.ok(result.totalItemCount > 0); // Still has items from successful profile
    });

    it('handles all profiles failing', async () => {
      cwMock.on(DescribeAlarmHistoryCommand).rejects(new Error('Service unavailable'));

      const profiles = ['sso_pn-core-dev', 'sso_pn-core-uat'];
      const provider = createMockProvider(profiles);
      const coordinator = new MultiProfileQueryCoordinator(provider);

      const result = await coordinator.queryAllProfiles({ profiles, startDate, endDate });

      assert.strictEqual(result.successfulProfiles.length, 0);
      assert.strictEqual(result.failedProfiles.length, 2);
      assert.ok(!result.allSucceeded);
      assert.strictEqual(result.totalItemCount, 0);
    });

    it('passes alarmName filter to service', async () => {
      const empty = await loadAlarmHistoryFixture('alarm-history-empty.json');
      cwMock.on(DescribeAlarmHistoryCommand).resolves(empty);

      const profiles = ['sso_pn-core-dev'];
      const provider = createMockProvider(profiles);
      const coordinator = new MultiProfileQueryCoordinator(provider);

      await coordinator.queryAllProfiles({
        profiles,
        startDate,
        endDate,
        alarmName: 'specific-alarm',
      });

      const call = cwMock.calls()[0];
      assert.ok(call);
      const input = call.args[0].input as DescribeAlarmHistoryCommandInput;
      assert.strictEqual(input.AlarmName, 'specific-alarm');
    });

    it('invokes progress callback for each profile', async () => {
      const empty = await loadAlarmHistoryFixture('alarm-history-empty.json');
      cwMock.on(DescribeAlarmHistoryCommand).resolves(empty);

      const profiles = ['sso_pn-core-dev'];
      const provider = createMockProvider(profiles);
      const coordinator = new MultiProfileQueryCoordinator(provider);

      const progressLog: { profile: string; status: string }[] = [];

      await coordinator.queryAllProfiles({
        profiles,
        startDate,
        endDate,
        onProgress: (profile, status) => {
          progressLog.push({ profile, status });
        },
      });

      assert.ok(progressLog.some((p) => p.status === 'start'));
      assert.ok(progressLog.some((p) => p.status === 'success'));
    });
  });
});
