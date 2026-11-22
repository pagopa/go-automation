import type { OperationalContext } from '../services/OperationalContext.js';
import type { ResolvedAwsAccount } from './ResolvedAwsAccount.js';

/** A logical account of a selection, resolved, with a context whose CloudWatch Logs reader reads that account. */
export interface AccountScopedContext {
  readonly account: ResolvedAwsAccount;
  readonly name: string;
  readonly context: OperationalContext;
}
