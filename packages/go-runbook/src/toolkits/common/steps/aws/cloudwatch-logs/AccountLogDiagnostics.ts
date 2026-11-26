import type { AwsAccountSelection } from '../../../accounts/AwsAccountSelection.js';
import type { AccountLogQuery } from './AccountLogQuery.js';

/** What an account log diagnosis reads: the queries of one log group, in every account of a selection. */
export interface AccountLogDiagnostics {
  readonly narrative: string;
  readonly accounts: AwsAccountSelection;
  readonly logGroup: string;
  readonly queries: ReadonlyArray<AccountLogQuery>;
}
