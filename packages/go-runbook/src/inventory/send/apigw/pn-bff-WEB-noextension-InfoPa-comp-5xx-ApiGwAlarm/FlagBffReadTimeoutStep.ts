import { ConditionEvaluator, type RunbookContext, type Step, type StepResult } from '../../../../engine/index.js';

const EVALUATOR = new ConditionEvaluator();
import { BFF_READ_TIMEOUT, BFF_READ_TIMEOUT_VAR } from './bffReadTimeout.js';

/**
 * Flags a BFF error that is a read timeout towards pn-external-registries, read on the whole row of the error: the
 * errors of pn-external-registries below it read the flag, not the bounded message.
 */
export class FlagBffReadTimeoutStep implements Step<void> {
  readonly id = 'flag-bff-read-timeout';
  readonly label = 'Riconosce il timeout BFF verso pn-external-registries';
  readonly kind = 'transform' as const;

  /**
   * @param context - Context of a BFF error
   * @returns The flag
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    const flagged = EVALUATOR.evaluate(BFF_READ_TIMEOUT, context);
    return { success: true, vars: { [BFF_READ_TIMEOUT_VAR]: String(flagged) } };
  }
}
