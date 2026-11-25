import type { RunbookContext, Step, StepKind, StepResult } from '../../../../../engine/index.js';
import { LAMBDA_REQUEST_ID } from '../helpers/lambdaRequestIdFilter.js';

/**
 * Descends from an invocation to the downstream its error routes to (`lambdaDownstreamTarget`), with its request
 * id, when the downstream has logs to read. Without a request id the descent is still requested, and the chain is
 * interrupted as `skipped`.
 *
 * @example
 * ```typescript
 * new DescendToLambdaDownstreamStep('descend-lambda', new Set(['pn-delivery']));
 * ```
 */
export class DescendToLambdaDownstreamStep implements Step<void> {
  readonly label: string = 'Discesa verso il downstream';
  readonly kind: StepKind = 'control';

  /**
   * @param id - Id of the step
   * @param readable - Downstreams with a log group
   */
  constructor(
    readonly id: string,
    private readonly readable: ReadonlySet<string>,
  ) {}

  /**
   * @param context - Context of the invocation
   * @returns The descent, or nothing
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    const target = (context.vars.get('lambdaDownstreamTarget') ?? '').trim();
    if (!this.readable.has(target)) return { success: true };
    // A malformed request id is a missing one: this invocation is skipped, the others of the batch are read.
    const requestId = (context.vars.get('lambdaRequestId') ?? '').trim();
    const value = LAMBDA_REQUEST_ID.test(requestId) ? requestId : '';
    return { success: true, descend: [{ target, identifier: { kind: 'requestId', value } }] };
  }
}
