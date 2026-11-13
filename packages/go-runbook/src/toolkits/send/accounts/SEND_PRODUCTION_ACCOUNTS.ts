import type { AwsAccountSource } from '../../common/accounts/AwsAccountSource.js';
import { SEND_CONFINFO_PROD_ACCOUNT } from './SEND_CONFINFO_PROD_ACCOUNT.js';
import { SEND_CORE_PROD_ACCOUNT } from './SEND_CORE_PROD_ACCOUNT.js';

/**
 * The SEND production accounts, core first (EVO-RBREORG-OPUS-01 P30–P31).
 * Shared by the runbooks that read both accounts.
 */
export const SEND_PRODUCTION_ACCOUNTS: ReadonlyArray<AwsAccountSource> = [
  SEND_CORE_PROD_ACCOUNT,
  SEND_CONFINFO_PROD_ACCOUNT,
];
