import type { OperationalContext } from '../services/OperationalContext.js';
import type { AccountScopedContext } from './AccountScopedContext.js';
import type { AwsAccountSelection } from './AwsAccountSelection.js';
import { awsLogicalAccountName } from './awsLogicalAccountName.js';
import { selectAwsAccounts } from './selectAwsAccounts.js';

/**
 * The accounts of a selection, resolved in the execution environment, each with a copy of the context that reads
 * its logs. The readers were prepared by the pre-execution check.
 *
 * @param context - Context of the step
 * @param selection - Account selection of the step
 * @returns The accounts in selection order, with their name and their context
 * @throws Error when the execution has no account port
 * @throws AwsAccountError when the execution cannot serve the selection
 *
 * @example
 * ```typescript
 * for (const account of accountScopedContexts(context, SELECTION)) {
 *   await executeCloudWatchLogsQuery(account.context, [logGroup], query, timeRange, {});
 * }
 * ```
 */
export function accountScopedContexts(
  context: OperationalContext,
  selection: AwsAccountSelection,
): ReadonlyArray<AccountScopedContext> {
  const port = context.services.awsAccounts;
  if (port === undefined) throw new Error('the account port is required to read logical accounts');
  return selectAwsAccounts(port, selection).map((account) => ({
    account,
    name: awsLogicalAccountName(account.account),
    context: { ...context, services: { ...context.services, cloudWatchLogs: port.cloudWatchLogsFor(account.account) } },
  }));
}
