import { RunbookMissingServicesError } from '../../../engine/errors/RunbookMissingServicesError.js';
import type { OperationalContext } from '../services/OperationalContext.js';
import type { AwsAccountSelection } from './AwsAccountSelection.js';
import type { ResolvedAwsAccount } from './ResolvedAwsAccount.js';
import { selectAwsAccounts } from './selectAwsAccounts.js';

/**
 * Logical accounts a step reads in this execution (EVO-AWSACCT-OPUS-01 §7):
 * the same result the pre-execution check computed, so the readers are already prepared.
 *
 * @param context - Operational context of the step
 * @param selection - The step's selection
 * @returns The effective logical accounts, resolved
 * @throws RunbookMissingServicesError without the account port
 */
export function resolveAwsAccountSelection(
  context: OperationalContext,
  selection: AwsAccountSelection,
): ReadonlyArray<ResolvedAwsAccount> {
  const port = context.services.awsAccounts;
  if (port === undefined) throw new RunbookMissingServicesError(selection.subject, ['awsAccounts']);
  return selectAwsAccounts(port, selection);
}
