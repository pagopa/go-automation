/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface GoAnalyzeAlarmConfig {
  /** Name of the CloudWatch alarm */
  readonly alarmName: string;
  /** Timestamp when the alarm triggered (ISO 8601) */
  readonly alarmDatetime: string;
  /** AWS SSO profile names */
  readonly awsProfiles: ReadonlyArray<string>;
}
