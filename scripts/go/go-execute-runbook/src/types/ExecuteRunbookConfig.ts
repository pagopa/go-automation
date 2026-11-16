export interface ExecuteRunbookConfig {
  readonly alarmEventId?: string;
  readonly executionId?: string;
  readonly awsProfiles?: ReadonlyArray<string>;
  readonly awsRegion?: string;
  /** Account directory of the logical AWS accounts (`aws.account.directory`). */
  readonly awsAccountDirectory?: ReadonlyArray<string>;
  /** How logical accounts are reached (`aws.account.binding`). */
  readonly awsAccountBinding?: string;
  /** Preferred SSO permission sets (`aws.account.permission.sets`). */
  readonly awsAccountPermissionSets?: ReadonlyArray<string>;
  readonly watchtowerUrl: string;
  readonly watchtowerServiceId: string;
  readonly watchtowerPassword?: string;
  readonly watchtowerServiceSecretArn?: string;
  readonly watchtowerHumanToken?: string;
  readonly executeRunbookArtifactRevision?: string;
  readonly dryRun?: boolean;
  readonly dryRunTimeoutMs?: number;
  readonly apply?: string;
  readonly confirmApply?: boolean;
}

export interface ExecuteRunbookCliConfig extends ExecuteRunbookConfig {
  readonly alarmEventId: string;
  readonly executionId: string;
}
