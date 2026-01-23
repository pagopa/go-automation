/**
 * Possible states for an Athena query execution
 */
export type AthenaQueryState = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

/**
 * Represents the execution status of an Athena query
 */
export interface AthenaQueryExecution {
  readonly QueryExecution: {
    readonly Status: {
      readonly State: AthenaQueryState;
      readonly StateChangeReason?: string;
    };
  };
}
