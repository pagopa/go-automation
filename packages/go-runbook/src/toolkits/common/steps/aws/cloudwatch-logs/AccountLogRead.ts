import type { AccountScopedContext } from '../../../accounts/AccountScopedContext.js';
import type { CloudWatchLogsReadAttempt } from './CloudWatchLogsReadAttempt.js';

/** A query of an account log diagnosis in one account: the read, or the coverage of its failure. */
export interface AccountLogRead {
  readonly account: AccountScopedContext;
  readonly queryKind: string;
  readonly read: CloudWatchLogsReadAttempt;
}
