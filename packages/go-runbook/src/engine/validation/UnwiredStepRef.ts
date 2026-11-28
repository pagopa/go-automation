/** A known error whose condition references a step the runbook does not wire. */
export interface UnwiredStepRef {
  /** Id of the known error. */
  readonly knownErrorCode: string;
  /** Step id referenced by the condition. */
  readonly stepId: string;
}
