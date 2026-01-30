/**
 * Alarm Analyzer - Analyzes and filters CloudWatch alarms
 * @module AlarmAnalyzer
 */

import type { AlarmHistoryItem } from '@aws-sdk/client-cloudwatch';

import type {
  FilteredAlarms,
  AlarmTimelineEntry,
  AlarmReportSummary,
} from '../types/alarms.types.js';

/** Alarm data aggregated by name */
interface AggregatedAlarmData {
  count: number;
  timestamps: Date[];
}

/** Combined analysis result for single-pass processing */
export interface CombinedAnalysisResult {
  readonly summary: ReadonlyArray<AlarmReportSummary>;
  readonly timeline: ReadonlyArray<AlarmTimelineEntry>;
}

/** Utility type for objects with a count property */
interface WithCount {
  readonly count: number;
}

/** Structure of alarm history data */
interface AlarmHistoryData {
  oldState: { stateValue: string };
  newState: { stateValue: string };
}

/**
 * Service for analyzing CloudWatch alarms
 * Note: This class is stateless by design - all methods are pure functions
 */
export class AlarmAnalyzer {
  private static readonly stateUpdateSummary = 'Alarm updated from OK to ALARM';

  /**
   * Filter alarms based on ignore patterns
   * Uses compiled RegExp for O(N) complexity instead of O(N*P*M)
   * @param alarmHistoryItems Array of alarm history items
   * @param ignorePatterns Array of patterns to ignore
   * @returns Filtered alarms (ignored and not ignored)
   */
  filterAlarms(
    alarmHistoryItems: ReadonlyArray<AlarmHistoryItem>,
    ignorePatterns: ReadonlyArray<string>,
  ): FilteredAlarms {
    // Pre-compile single RegExp for all patterns
    const escapedPatterns = ignorePatterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const combinedPattern =
      ignorePatterns.length > 0 ? new RegExp(escapedPatterns.join('|')) : null;

    const stateUpdateItems = alarmHistoryItems.filter((item) => {
      try {
        if (item.HistoryData === undefined) return false;
        const parsed = JSON.parse(item.HistoryData) as AlarmHistoryData;
        return parsed.newState.stateValue === 'ALARM';
      } catch {
        return false;
      }
    });

    const ignored: AlarmHistoryItem[] = [];
    const notIgnored: AlarmHistoryItem[] = [];

    for (const item of stateUpdateItems) {
      const name = item.AlarmName;
      if (name && combinedPattern?.test(name)) {
        ignored.push(item);
      } else {
        notIgnored.push(item);
      }
    }

    return { notIgnored, ignored };
  }

  /**
   * Generate summary only (optimized for count-only use cases)
   * Single pass, O(N) time complexity
   * @param alarmHistoryItems Array of alarm history items (should be already filtered)
   * @returns Array of alarm summaries with counts, sorted by alarm name
   */
  generateSummary(alarmHistoryItems: ReadonlyArray<AlarmHistoryItem>): AlarmReportSummary[] {
    const countMap = new Map<string, number>();

    for (const item of alarmHistoryItems) {
      const name = item.AlarmName;
      if (name) {
        countMap.set(name, (countMap.get(name) ?? 0) + 1);
      }
    }

    return Array.from(countMap.entries())
      .map(([alarmName, count]) => ({ alarmName, count }))
      .sort((a, b) => a.alarmName.localeCompare(b.alarmName));
  }

  /**
   * Generate full analysis with summary and timeline (single pass)
   * Single pass, O(N) time complexity - most efficient when both are needed
   * @param alarmHistoryItems Array of alarm history items (should be already filtered)
   * @returns Combined summary and timeline data
   */
  generateFullAnalysis(alarmHistoryItems: ReadonlyArray<AlarmHistoryItem>): CombinedAnalysisResult {
    const dataMap = new Map<string, AggregatedAlarmData>();

    for (const item of alarmHistoryItems) {
      const { AlarmName: alarmName, Timestamp: timestamp } = item;
      if (alarmName) {
        const entry = dataMap.get(alarmName);
        if (entry) {
          entry.count++;
          if (timestamp) entry.timestamps.push(timestamp);
        } else {
          dataMap.set(alarmName, {
            count: 1,
            timestamps: timestamp ? [timestamp] : [],
          });
        }
      }
    }

    const sorted = Array.from(dataMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    return {
      summary: sorted.map(([alarmName, { count }]) => ({ alarmName, count })),
      timeline: sorted.map(([alarmName, { timestamps }]) => ({ alarmName, timestamps })),
    };
  }

  /**
   * Calculate total count from summaries
   * @param summaries Array of alarm summaries
   * @returns Total count of all alarm transitions
   */
  getTotalCount<T extends WithCount>(summaries: ReadonlyArray<T>): number {
    return summaries.reduce((total, summary) => total + summary.count, 0);
  }
}
