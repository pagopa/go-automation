/** Identifiers of the five pipeline steps of an INTEROP k8s alarm runbook. */
export interface InteropK8sRunbookStepIds {
  readonly resolveContext: string;
  readonly queryApplicationLogs: string;
  readonly analyzeApplicationLogs: string;
  readonly queryCidTracker: string;
  readonly analyzeCidTracker: string;
}
