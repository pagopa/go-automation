/** Cloud execution constraints declared by a runbook. */
export interface CloudExecutionPolicy {
  /** V1 workers only execute runbooks without external side effects. */
  readonly sideEffects: 'NONE';
}
