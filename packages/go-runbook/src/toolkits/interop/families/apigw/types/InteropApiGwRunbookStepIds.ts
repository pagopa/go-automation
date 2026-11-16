/** Identifiers of the seven pipeline steps of an INTEROP API Gateway alarm runbook. */
export interface InteropApiGwRunbookStepIds {
  readonly resolveContext: string;
  readonly queryApiGwAggregates: string;
  readonly analyzeApiGwAggregates: string;
  readonly queryApplicationLogs: string;
  readonly analyzeApplicationLogs: string;
  readonly queryCidTracker: string;
  readonly analyzeCidTracker: string;
}
