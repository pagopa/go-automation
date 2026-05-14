/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface GoAnalyzeAlarmConfig {
  /** Name of the CloudWatch alarm */
  readonly alarmName: string;
  /**
   * Timestamp when the alarm triggered (ISO 8601). When the alarm covers
   * multiple occurrences this carries the FIRST occurrence and
   * {@link alarmDatetimeEnd} carries the last.
   */
  readonly alarmDatetime: string;
  /**
   * Optional timestamp of the last occurrence (ISO 8601). When set, the
   * runbook analysis window stretches from `alarmDatetime` minus the
   * window to `alarmDatetimeEnd` plus the window (multi-occurrence mode).
   */
  readonly alarmDatetimeEnd?: string;
  /** AWS SSO profile names */
  readonly awsProfiles: ReadonlyArray<string>;
}
