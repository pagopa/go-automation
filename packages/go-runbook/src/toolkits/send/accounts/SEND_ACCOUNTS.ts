import type { AwsLogicalAccount } from '../../common/accounts/AwsLogicalAccount.js';
import { parseAwsLogicalAccount } from '../../common/accounts/parseAwsLogicalAccount.js';

/**
 * Logical AWS accounts of SEND (EVO-AWSACCT-OPUS-01 §5.1): no account id, environment
 * or profile. Each execution maps them to its environment's accounts through
 * the account directory (`aws.account.directory`).
 */
export const SEND_ACCOUNTS: { readonly core: AwsLogicalAccount; readonly confinfo: AwsLogicalAccount } = {
  core: parseAwsLogicalAccount('send/core'),
  confinfo: parseAwsLogicalAccount('send/confinfo'),
};
