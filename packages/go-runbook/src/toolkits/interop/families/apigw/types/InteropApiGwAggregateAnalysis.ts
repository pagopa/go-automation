export interface InteropApiGwAggregateAnalysis {
  readonly aggregateCount: number;
  readonly errorCount: number;
  readonly statuses: ReadonlyArray<string>;
  readonly integrationStatuses: ReadonlyArray<string>;
  readonly integrationErrors: ReadonlyArray<string>;
  readonly httpMethods: ReadonlyArray<string>;
  readonly requestPaths: ReadonlyArray<string>;
  readonly sourceIps: ReadonlyArray<string>;
}
