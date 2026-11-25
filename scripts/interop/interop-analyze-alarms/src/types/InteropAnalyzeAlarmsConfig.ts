/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface InteropAnalyzeAlarmsConfig {
  /** AWS profile name */
  readonly awsProfile: string;
  /** Optional CloudWatch alarm name. When omitted, every supported INTEROP k8s alarm in the range is analyzed. */
  readonly alarmName?: string;
  /** CloudWatch alarm history start date, ISO 8601. */
  readonly startDate: string;
  /** CloudWatch alarm history end date, ISO 8601. */
  readonly endDate: string;
}
