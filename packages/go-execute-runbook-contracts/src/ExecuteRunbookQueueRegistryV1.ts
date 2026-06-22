/** One regional queue published by the go-execute-runbook deployment. */
export interface ExecuteRunbookQueueRegistryEntryV1 {
  readonly queueUrl: string;
  readonly queueArn: string;
  readonly stackName: string;
  readonly messageRetentionSeconds: number;
}

/** GA-owned regional queue registry consumed by Watchtower. */
export interface ExecuteRunbookQueueRegistryV1 {
  readonly schemaVersion: 1;
  readonly revision: string;
  readonly publishedAt: string;
  readonly queues: Readonly<Record<string, ExecuteRunbookQueueRegistryEntryV1>>;
}

/** Input used to calculate revision before adding it to the registry. */
export type ExecuteRunbookQueueRegistryRevisionPayloadV1 = Omit<ExecuteRunbookQueueRegistryV1, 'revision'>;
