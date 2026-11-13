import type { AwsAccountsPort } from '../services/ports/AwsAccountsPort.js';
import type { AwsAccountSelection } from './AwsAccountSelection.js';
import type { AwsLogicalAccount } from './AwsLogicalAccount.js';
import { AwsAccountError } from './AwsAccountError.js';
import type { ResolvedAwsAccount } from './ResolvedAwsAccount.js';

/**
 * Logical accounts a selection reads in this execution, resolved
 * (EVO-AWSACCT-OPUS-01 §5.4, §6.3). Used by the pre-execution check and by
 * the steps, so both see the same accounts.
 *
 * Checks, in order: the environment is allowed; no two logical accounts of the
 * selection share one physical account (aliases); the occurrence account,
 * when there is one, belongs to the selection (either scope); every effective
 * logical account has a directory entry.
 *
 * @param port - Account port of the execution
 * @param selection - Selection of a step
 * @returns The effective logical accounts, resolved, in selection order
 * @throws AwsAccountError when the execution cannot serve the selection
 */
export function selectAwsAccounts(
  port: AwsAccountsPort,
  selection: AwsAccountSelection,
): ReadonlyArray<ResolvedAwsAccount> {
  const environment = port.environment();
  if (selection.environments !== undefined && !selection.environments.includes(environment)) {
    throw new AwsAccountError(
      'AWS_ACCOUNT_ENVIRONMENT_NOT_ALLOWED',
      `${selection.subject} reads only environments ${selection.environments.join(', ')}, not ${environment}`,
    );
  }

  const owners = new Map<string, string>();
  for (const account of selection.accounts) {
    const accountId = tryResolve(port, account)?.accountId;
    if (accountId === undefined) continue;
    const owner = owners.get(accountId);
    if (owner !== undefined) {
      throw new AwsAccountError(
        'AWS_ACCOUNT_SELECTION_AMBIGUOUS',
        `${selection.subject} reads ${owner} and ${account}, which are the same AWS account in ${environment}`,
      );
    }
    owners.set(accountId, account);
  }

  if (port.hasOccurrence()) {
    // For either scope, an occurrence must belong to the selection: the step would
    // otherwise analyse accounts unrelated to the alarm that fired.
    const account = port.accountOfOccurrence(selection.accounts);
    if (account === undefined) {
      throw new AwsAccountError(
        'AWS_OCCURRENCE_ACCOUNT_MISMATCH',
        `The occurrence account is none of ${selection.subject}'s accounts (${selection.accounts.join(', ')}) in ${environment}`,
      );
    }
    if (selection.scope === 'occurrence-account') return [port.resolve(account)];
  }
  return selection.accounts.map((account) => port.resolve(account));
}

function tryResolve(port: AwsAccountsPort, account: AwsLogicalAccount): ResolvedAwsAccount | undefined {
  try {
    return port.resolve(account);
  } catch (error: unknown) {
    if (error instanceof AwsAccountError && error.code === 'AWS_ACCOUNT_NOT_CONFIGURED') return undefined;
    throw error;
  }
}
