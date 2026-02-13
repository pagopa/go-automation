/**
 * MultiProfileQueryCoordinator - Coordinates CloudWatch queries across multiple AWS profiles
 *
 * Executes queries in parallel and aggregates results with comprehensive error handling.
 */

import type { ProfileQueryResult, ProfileQuerySuccess, ProfileQueryFailure } from '../types/ProfileQueryResult.js';
import type { MultiProfileQueryResult } from '../types/MultiProfileQueryResult.js';
import type { AlarmHistoryItem } from '@aws-sdk/client-cloudwatch';
import { isProfileQuerySuccess, isProfileQueryFailure } from '../types/ProfileQueryResult.js';

import { CloudWatchService } from './CloudWatchService.js';
import type { AWS } from '@go-automation/go-common';

/**
 * Options for multi-profile query execution
 */
export interface MultiProfileQueryOptions {
  /** List of AWS SSO profile names to query */
  readonly profiles: ReadonlyArray<string>;

  /** Start date for alarm history (ISO 8601 format) */
  readonly startDate: string;

  /** End date for alarm history (ISO 8601 format) */
  readonly endDate: string;

  /** Optional alarm name filter */
  readonly alarmName?: string | undefined;

  /** Callback for progress reporting */
  readonly onProgress?: (profile: string, status: 'start' | 'success' | 'failure') => void;
}

/**
 * Coordinates CloudWatch alarm history queries across multiple AWS profiles.
 *
 * Executes queries in parallel for optimal performance and aggregates results.
 * Handles individual profile failures gracefully, continuing with successful profiles.
 *
 * @example
 * ```typescript
 * const coordinator = new MultiProfileQueryCoordinator();
 * const result = await coordinator.queryAllProfiles({
 *   profiles: ['sso_pn-core-dev', 'sso_pn-core-uat'],
 *   startDate: '2025-01-01T00:00:00Z',
 *   endDate: '2025-01-31T23:59:59Z',
 * });
 *
 * console.log(`Retrieved ${result.totalItemCount} items from ${result.successfulProfiles.length} profiles`);
 * ```
 */
export class MultiProfileQueryCoordinator {
  constructor(private readonly provider: AWS.AWSMultiClientProvider) {}

  /**
   * Query alarm history across all specified AWS profiles in p arallel.
   *
   * Complexity: O(P * N) where P is profile count, N is items per profile.
   * Parallel execution reduces wall-clock time to O(max(N_i)).
   *
   * @param options - Query configuration options
   * @returns Aggregated results from all profiles
   */
  async queryAllProfiles(options: MultiProfileQueryOptions): Promise<MultiProfileQueryResult> {
    const { profiles, startDate, endDate, alarmName, onProgress } = options;

    // Deduplicate profiles
    const uniqueProfiles = [...new Set(profiles)];

    if (uniqueProfiles.length === 0) {
      return {
        items: [],
        totalItemCount: 0,
        successfulProfiles: [],
        failedProfiles: [],
        allSucceeded: true,
        profileCount: 0,
      };
    }

    // Create service instances and track for cleanup
    const serviceMap = new Map<string, CloudWatchService>();

    try {
      // Initialize CloudWatch services for each profile
      for (const profile of uniqueProfiles) {
        const client = this.provider.getClientProvider(profile).cloudWatch;
        serviceMap.set(profile, new CloudWatchService(client));
      }

      // Execute queries in parallel
      const results = await this.executeParallelQueries(serviceMap, startDate, endDate, alarmName, onProgress);

      return this.aggregateResults(results, uniqueProfiles.length);
    } finally {
      // Always cleanup services
      for (const service of serviceMap.values()) {
        service.close();
      }
    }
  }

  /**
   * Execute queries in parallel, collecting all results
   */
  private async executeParallelQueries(
    serviceMap: ReadonlyMap<string, CloudWatchService>,
    startDate: string,
    endDate: string,
    alarmName: string | undefined,
    onProgress?: (profile: string, status: 'start' | 'success' | 'failure') => void,
  ): Promise<ReadonlyArray<ProfileQueryResult>> {
    const queryPromises = Array.from(serviceMap.entries()).map(async ([profile, service]) =>
      this.querySingleProfile(profile, service, startDate, endDate, alarmName, onProgress),
    );

    // Promise.allSettled ensures all queries complete
    const settledResults = await Promise.allSettled(queryPromises);
    const profiles = Array.from(serviceMap.keys());

    return settledResults.map((settled, index) => {
      const profile = profiles[index];
      if (!profile) {
        throw new Error('Unexpected: profile index mismatch');
      }

      if (settled.status === 'fulfilled') {
        return settled.value;
      }

      // Convert rejection to ProfileQueryFailure
      return {
        status: 'failure' as const,
        profile,
        error: settled.reason instanceof Error ? settled.reason : new Error(String(settled.reason)),
      };
    });
  }

  /**
   * Query a single profile and wrap result in ProfileQueryResult
   */
  private async querySingleProfile(
    profile: string,
    service: CloudWatchService,
    startDate: string,
    endDate: string,
    alarmName: string | undefined,
    onProgress?: (profile: string, status: 'start' | 'success' | 'failure') => void,
  ): Promise<ProfileQueryResult> {
    onProgress?.(profile, 'start');

    try {
      const items = await service.describeAlarmHistory(startDate, endDate, alarmName);

      onProgress?.(profile, 'success');

      return {
        status: 'success',
        profile,
        items,
        itemCount: items.length,
      };
    } catch (error) {
      onProgress?.(profile, 'failure');

      return {
        status: 'failure',
        profile,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Aggregate individual profile results into combined result
   */
  private aggregateResults(
    results: ReadonlyArray<ProfileQueryResult>,
    totalProfileCount: number,
  ): MultiProfileQueryResult {
    const successfulProfiles: ProfileQuerySuccess[] = [];
    const failedProfiles: ProfileQueryFailure[] = [];
    const allItems: AlarmHistoryItem[] = [];

    for (const result of results) {
      if (isProfileQuerySuccess(result)) {
        successfulProfiles.push(result);
        allItems.push(...result.items);
      } else if (isProfileQueryFailure(result)) {
        failedProfiles.push(result);
      }
    }

    // Deduplicate items by unique key
    const deduplicatedItems = this.deduplicateAlarmItems(allItems);

    return {
      items: deduplicatedItems,
      totalItemCount: deduplicatedItems.length,
      successfulProfiles,
      failedProfiles,
      allSucceeded: failedProfiles.length === 0,
      profileCount: totalProfileCount,
    };
  }

  /**
   * Deduplicate alarm history items by unique key.
   * Uses AlarmName + Timestamp + HistoryItemType as unique identifier.
   *
   * Note: Duplicates are unlikely since each profile queries a different AWS account.
   * This is a safety measure for edge cases (e.g., cross-account alarm forwarding).
   */
  private deduplicateAlarmItems(items: ReadonlyArray<AlarmHistoryItem>): ReadonlyArray<AlarmHistoryItem> {
    const seen = new Map<string, AlarmHistoryItem>();

    for (const item of items) {
      const key = this.createItemKey(item);
      if (!seen.has(key)) {
        seen.set(key, item);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Create unique key for an alarm history item
   */
  private createItemKey(item: AlarmHistoryItem): string {
    const alarmName = item.AlarmName ?? '';
    const timestamp = item.Timestamp?.toISOString() ?? '';
    const historyType = item.HistoryItemType ?? '';
    return `${alarmName}|${timestamp}|${historyType}`;
  }
}
