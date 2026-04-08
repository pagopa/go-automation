/**
 * Script configuration interface
 * Represents all validated configuration parameters for go-report-alarms
 */
export interface GoReportAlarmsConfig {
  /** Start date for alarm history (ISO 8601 format) */
  readonly startDate: string;

  /** End date for alarm history (ISO 8601 format) */
  readonly endDate: string;

  /** Optional alarm name filter */
  readonly alarmName: string | undefined;

  /** Patterns of alarms to ignore (loaded from config file via GOPaths if not provided) */
  readonly ignorePatterns: ReadonlyArray<string>;

  /** Enable verbose output */
  readonly verbose: boolean;

  /** Multiple AWS profile names (for multi-account mode) */
  readonly awsProfiles: ReadonlyArray<string> | undefined;
}
