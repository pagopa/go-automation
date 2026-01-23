/**
 * Types for CloudWatch Alarms Analysis
 */

import type { AlarmHistoryItem } from '@aws-sdk/client-cloudwatch';

/**
 * Filtered alarms result
 */
export interface FilteredAlarms {
  /** Alarms that are not in the ignore list */
  readonly notIgnored: ReadonlyArray<AlarmHistoryItem>;

  /** Alarms that match the ignore patterns */
  readonly ignored: ReadonlyArray<AlarmHistoryItem>;
}

/**
 * Alarm timeline entry
 */
export interface AlarmTimelineEntry {
  /** Alarm name */
  readonly alarmName: string;

  /** List of timestamps when alarm transitioned from OK to ALARM */
  readonly timestamps: ReadonlyArray<Date>;
}

/**
 * Alarm report summary
 */
export interface AlarmReportSummary {
  /** Alarm name */
  readonly alarmName: string;

  /** Number of OK to ALARM transitions */
  readonly count: number;
}
