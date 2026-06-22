export interface ExecuteRunbookConfig {
  readonly alarmEventId?: string;
  readonly executionId?: string;
  readonly watchtowerUrl: string;
  readonly watchtowerServiceId: string;
  readonly watchtowerPassword?: string;
  readonly watchtowerServiceSecretArn?: string;
}

export interface ExecuteRunbookCliConfig extends ExecuteRunbookConfig {
  readonly alarmEventId: string;
  readonly executionId: string;
}
