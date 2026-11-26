/** How the root level of a Lambda runbook divides the error scan into invocations. */
export interface LambdaInvocationLevelConfig {
  /** Step of the error scan. */
  readonly errorsStepId: string;
  /** Step of the reconstruction of the invocations. */
  readonly invocationStepId: string;
}
