import type { AwsLogicalAccount } from './AwsLogicalAccount.js';

/** A logical account resolved in the environment of one execution (EVO-AWSACCT-OPUS-01 §5.5). */
export interface ResolvedAwsAccount {
  readonly account: AwsLogicalAccount;
  readonly environment: string;
  /** 12-digit AWS account id, from the account directory of the execution. */
  readonly accountId: string;
  /** Region of the execution. */
  readonly region: string;
}
