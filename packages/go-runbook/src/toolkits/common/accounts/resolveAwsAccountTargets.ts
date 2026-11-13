import { parseAwsProfileEntries } from '@pagopa/go-aws/profiles';

import type { RunbookContext } from '../../../engine/types/RunbookContext.js';
import type { AwsAccountSelection } from './AwsAccountSelection.js';
import type { AwsAccountTarget } from './AwsAccountTarget.js';

/**
 * Resolves the accounts a multi-account step reads in this execution, from the
 * `awsAccountId`, `awsRegion` and `awsProfiles` parameters (EVO-RBREORG-OPUS-01 P30).
 *
 * An occurrence account outside the selection is rejected before any read.
 * Without an occurrence account (local execution) every account needs one of its
 * profiles in `awsProfiles`; with one (cloud execution) an account without a
 * configured profile is read through OAM.
 *
 * Complexity: O(A·P) for A accounts and P profiles per account.
 *
 * @param context - Runbook context with the execution parameters
 * @param selection - Accounts and scope of the step
 * @returns The accounts to read, in the order of the selection
 * @throws Error when the region, the occurrence account or a local profile is not acceptable
 *
 * @example
 * ```typescript
 * for (const target of resolveAwsAccountTargets(context, selection)) {
 *   const scoped = scopeCloudWatchLogsToAccount(context, target);
 * }
 * ```
 */
export function resolveAwsAccountTargets(
  context: RunbookContext,
  selection: AwsAccountSelection,
): ReadonlyArray<AwsAccountTarget> {
  const region = context.params.get('awsRegion') ?? selection.defaultRegion;
  if (selection.restrictToDefaultRegion === true && region !== selection.defaultRegion) {
    throw new Error(`${selection.subject}: unsupported region ${region}`);
  }
  const occurrenceAccount = context.params.get('awsAccountId');
  if (
    occurrenceAccount !== undefined &&
    !selection.accounts.some((account) => account.accountId === occurrenceAccount)
  ) {
    throw new Error(`${selection.subject}: unsupported occurrence account ${occurrenceAccount}`);
  }
  const configured = new Set(parseAwsProfileEntries((context.params.get('awsProfiles') ?? '').split(',')).profileNames);
  const accounts =
    selection.scope === 'occurrence-account' && occurrenceAccount !== undefined
      ? selection.accounts.filter((account) => account.accountId === occurrenceAccount)
      : selection.accounts;
  return accounts.map((account) => {
    const profile = account.profiles.find((candidate) => configured.has(candidate));
    if (profile === undefined && occurrenceAccount === undefined) {
      throw new Error(
        `${selection.subject}: missing ${account.name} AWS profile; configure one for every account or set the occurrence account`,
      );
    }
    return { account, region, ...(profile === undefined ? {} : { profile }) };
  });
}
