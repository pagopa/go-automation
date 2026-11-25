export interface PostelBatchRecovery {
  readonly impactedBatchIds: ReadonlyArray<string>;
  readonly workedBatchIds: ReadonlyArray<string>;
  readonly pendingBatchIds: ReadonlyArray<string>;
  readonly allWorked: boolean;
  readonly statusRowsFound: number;
  readonly lookupTimeRange: {
    readonly start: string;
    readonly end: string;
  };
}
