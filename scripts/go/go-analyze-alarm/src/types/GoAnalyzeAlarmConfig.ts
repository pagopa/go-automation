/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
type AnalysisMode = 'single' | 'range' | 'stats';

export interface GoAnalyzeAlarmConfig {
  /** Analysis execution mode */
  readonly analysisMode: AnalysisMode;
  /**
   * Name of the CloudWatch alarm. Required in `single` and `range` mode;
   * unused in `stats` mode, which only reads the local runbook catalog.
   */
  readonly alarmName?: string;
  /**
   * Timestamp when the alarm triggered (ISO 8601). When the alarm covers
   * multiple occurrences this carries the FIRST occurrence and
   * {@link alarmDatetimeEnd} carries the last. Required in `single` and
   * `range` mode, unused in `stats` mode.
   */
  readonly alarmDatetime?: string;
  /**
   * Optional timestamp of the last occurrence (ISO 8601). When set, the
   * runbook analysis window stretches from `alarmDatetime` minus the
   * window to `alarmDatetimeEnd` plus the window (multi-occurrence mode).
   */
  readonly alarmDatetimeEnd?: string;
  /**
   * AWS SSO profile names. Required in `single` and `range` mode; `stats`
   * mode runs fully offline and ignores them.
   */
  readonly awsProfiles?: ReadonlyArray<string>;
  /** Account directory of the logical AWS accounts (`aws.account.directory`). */
  readonly awsAccountDirectory?: ReadonlyArray<string>;
  /** How logical accounts are reached (`aws.account.binding`). */
  readonly awsAccountBinding?: string;
  /** Environment of the account directory to read (`aws.account.environment`). */
  readonly awsAccountEnvironment?: string;
  /** Preferred SSO permission sets (`aws.account.permission.sets`). */
  readonly awsAccountPermissionSets?: ReadonlyArray<string>;
  /** Include the per-runbook detail table in `stats` mode */
  readonly statsDetail: boolean;
  /** Write the `stats` mode report as a JSON artifact */
  readonly statsSave: boolean;
  /** Restrict the `stats` mode report to a single product */
  readonly statsProduct?: string;
}
