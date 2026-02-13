import type { ExecutionInfo } from './ExecutionInfo.js';
import type { StepTrace } from './StepTrace.js';
import type { CaseMatchingTrace } from './CaseMatchingTrace.js';
import type { ActionTrace } from './ActionTrace.js';
import type { ExecutionSummary } from './ExecutionSummary.js';
import type { RunbookExecutionTrace } from './RunbookExecutionTrace.js';

/**
 * Immutable builder for constructing a RunbookExecutionTrace.
 * Each mutation method returns a new instance.
 *
 * @example
 * ```typescript
 * const trace = TraceBuilder.create()
 *   .withExecution(executionInfo)
 *   .addStepTrace(stepTrace)
 *   .addCaseMatchingTrace(caseTrace)
 *   .withAction(actionTrace)
 *   .build(summary);
 * ```
 */
export class TraceBuilder {
  private constructor(
    private readonly executionInfo: ExecutionInfo | undefined,
    private readonly stepTraces: ReadonlyArray<StepTrace>,
    private readonly caseMatchingTraces: ReadonlyArray<CaseMatchingTrace>,
    private readonly actionTrace: ActionTrace | undefined,
  ) {}

  /**
   * Creates a new empty TraceBuilder.
   *
   * @returns A new TraceBuilder instance
   */
  static create(): TraceBuilder {
    return new TraceBuilder(undefined, [], [], undefined);
  }

  /**
   * Sets the execution info metadata.
   *
   * @param info - Execution metadata
   * @returns A new TraceBuilder with the execution info set
   */
  withExecution(info: ExecutionInfo): TraceBuilder {
    return new TraceBuilder(info, this.stepTraces, this.caseMatchingTraces, this.actionTrace);
  }

  /**
   * Adds a step trace to the builder.
   *
   * @param trace - Step trace to add
   * @returns A new TraceBuilder with the step trace added
   */
  addStepTrace(trace: StepTrace): TraceBuilder {
    return new TraceBuilder(this.executionInfo, [...this.stepTraces, trace], this.caseMatchingTraces, this.actionTrace);
  }

  /**
   * Adds a case matching trace to the builder.
   *
   * @param trace - Case matching trace to add
   * @returns A new TraceBuilder with the case matching trace added
   */
  addCaseMatchingTrace(trace: CaseMatchingTrace): TraceBuilder {
    return new TraceBuilder(this.executionInfo, this.stepTraces, [...this.caseMatchingTraces, trace], this.actionTrace);
  }

  /**
   * Sets the action trace.
   *
   * @param trace - Action execution trace
   * @returns A new TraceBuilder with the action trace set
   */
  withAction(trace: ActionTrace): TraceBuilder {
    return new TraceBuilder(this.executionInfo, this.stepTraces, this.caseMatchingTraces, trace);
  }

  /**
   * Builds the final immutable RunbookExecutionTrace.
   *
   * @param summary - Execution summary
   * @returns The complete execution trace
   * @throws Error if execution info is not set
   */
  build(summary: ExecutionSummary): RunbookExecutionTrace {
    if (this.executionInfo === undefined) {
      throw new Error('ExecutionInfo is required to build a trace. Call withExecution() first.');
    }

    return {
      execution: this.executionInfo,
      steps: this.stepTraces,
      caseMatching: this.caseMatchingTraces,
      ...(this.actionTrace !== undefined ? { action: this.actionTrace } : {}),
      summary,
    };
  }
}
