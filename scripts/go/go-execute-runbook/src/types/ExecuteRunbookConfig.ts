export interface ExecuteRunbookConfig {
  readonly alarmEventId?: string;
  readonly executionId?: string;
  readonly awsProfiles?: ReadonlyArray<string>;
  readonly awsRegion?: string;
  readonly watchtowerUrl: string;
  readonly watchtowerServiceId: string;
  readonly watchtowerPassword?: string;
  readonly watchtowerServiceSecretArn?: string;
  readonly watchtowerHumanToken?: string;
  readonly dryRun?: boolean;
  readonly dryRunTimeoutMs?: number;
  readonly apply?: string;
  readonly confirmApply?: boolean;
  readonly confirmApplyAll?: boolean;
}

export interface ExecuteRunbookCliConfig extends ExecuteRunbookConfig {
  readonly alarmEventId: string;
  readonly executionId: string;
}
