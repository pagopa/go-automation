import type { StepResult } from '../../../engine/types/StepResult.js';
import type { AwsAccountSelection } from '../accounts/AwsAccountSelection.js';
import type { OperationalContext } from '../services/OperationalContext.js';
import type { OperationalServiceName } from '../services/OperationalServiceName.js';

/**
 * Base of every step that uses operational services besides the reporter
 * (EVO-RBREORG-OPUS-01 §7.1.3 A). It has no fields, so subclasses keep the same
 * own properties and the same definition digest. Declaring the required
 * services lets the engine reject an execution that cannot serve the step
 * before the first step runs.
 *
 * @typeParam TOutput - Output of the step
 */
export abstract class OperationalStep<TOutput = unknown> {
  /**
   * Operational services the step uses.
   *
   * @returns Service names, keys of the {@link ServiceRegistry}
   */
  abstract requiredServices(): ReadonlyArray<OperationalServiceName>;

  /**
   * Logical AWS accounts the step reads, checked and prepared before the first
   * step (EVO-AWSACCT-OPUS-01 §6.3). On the prototype, so it never changes the
   * definition digest. A step that returns selections also requires `awsAccounts`.
   *
   * @returns The step's account selections; none by default
   */
  accountSelections(): ReadonlyArray<AwsAccountSelection> {
    return [];
  }

  /**
   * Executes the step with the operational services.
   *
   * @param context - Context with the operational service registry
   * @returns The step result
   */
  abstract execute(context: OperationalContext): Promise<StepResult<TOutput>>;
}
