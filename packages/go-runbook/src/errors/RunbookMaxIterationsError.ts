/**
 * Error thrown when the maximum number of iterations is exceeded during
 * runbook execution. Indicates a possible infinite loop.
 */
export class RunbookMaxIterationsError extends Error {
  override readonly name = 'RunbookMaxIterationsError';

  constructor(
    readonly runbookId: string,
    readonly maxIterations: number,
    readonly lastStepId: string,
    readonly visitedSequence: ReadonlyArray<string>,
  ) {
    super(
      `Runbook "${runbookId}" exceeded the limit of ${maxIterations} iterations. ` +
        `Last step: "${lastStepId}". Possible infinite loop detected. ` +
        `Last visited steps: [${visitedSequence.slice(-10).join(' -> ')}]`,
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
