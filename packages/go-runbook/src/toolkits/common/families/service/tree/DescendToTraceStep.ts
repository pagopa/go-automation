import type { RunbookContext } from '../../../../../engine/types/RunbookContext.js';
import type { Step } from '../../../../../engine/types/Step.js';
import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';

/**
 * Descends from an error of a service to the rest of its trace, when the error has a trace id.
 */
export class DescendToTraceStep implements Step<void> {
  readonly label: string = 'Discesa verso il trace';
  readonly kind: StepKind = 'control';

  /**
   * @param id - Id of the step
   * @param target - Trace level
   * @param traceIdVar - Variable with the trace id of the error
   */
  constructor(
    readonly id: string,
    private readonly target: string,
    private readonly traceIdVar: string,
  ) {}

  /**
   * @param context - Context of the error
   * @returns The descent
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    // An error without a trace id has nothing to follow: it is a leaf of its own.
    const identifier = (context.vars.get(this.traceIdVar) ?? '').trim();
    if (identifier === '') return { success: true };
    return { success: true, descend: [{ target: this.target, identifier, kind: 'traceId' }] };
  }
}
