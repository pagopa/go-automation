import { collectRunbookSteps } from '../../../engine/core/collectRunbookSteps.js';
import { RunbookMissingServicesError } from '../../../engine/errors/RunbookMissingServicesError.js';
import type { Runbook } from '../../../engine/types/Runbook.js';
import type { AwsAccountSelection } from '../accounts/AwsAccountSelection.js';
import type { AwsLogicalAccount } from '../accounts/AwsLogicalAccount.js';
import { selectAwsAccounts } from '../accounts/selectAwsAccounts.js';
import type { ServiceRegistry } from '../services/ServiceRegistry.js';

/** A step that declares the logical accounts it reads (see `OperationalStep.accountSelections`). */
interface AccountSelectingStep {
  accountSelections?(): ReadonlyArray<AwsAccountSelection>;
}

/**
 * Pre-execution check of the logical AWS accounts (EVO-AWSACCT-OPUS-01 §6.3).
 *
 * Collects the selections of every step (nested and action steps included),
 * resolves environment and effective accounts, and prepares their readers,
 * without querying logs. A runbook without selections needs no account port.
 *
 * @param runbook - Runbook about to run
 * @param services - Services of the execution
 * @throws RunbookMissingServicesError when selections exist but the account port is missing
 * @throws AwsAccountError when the execution cannot serve a selection
 */
export async function assertAwsAccounts(runbook: Runbook, services: ServiceRegistry): Promise<void> {
  const selections = collectRunbookSteps(runbook).flatMap(
    (step) => (step as AccountSelectingStep).accountSelections?.() ?? [],
  );
  if (selections.length === 0) return;

  const port = services.awsAccounts;
  if (port === undefined) throw new RunbookMissingServicesError(runbook.metadata.id, ['awsAccounts']);

  const effective = new Set<AwsLogicalAccount>();
  for (const selection of selections) {
    for (const resolved of selectAwsAccounts(port, selection)) effective.add(resolved.account);
  }
  await port.prepare([...effective]);
}
