/** A known case whose condition references a step the runbook does not wire. */
export interface UnwiredStepRef {
  /** Id of the known case. */
  readonly caseId: string;
  /** Step id referenced by the condition. */
  readonly stepId: string;
}
