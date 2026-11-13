import type { AwsAccountSource } from '../../common/accounts/AwsAccountSource.js';

/** SEND core production account and the local profiles that reach it, in order of preference. */
export const SEND_CORE_PROD_ACCOUNT: AwsAccountSource = {
  name: 'core',
  accountId: '510769970275',
  profiles: ['sso_pn-core-prod_readonly', 'sso_pn-core-prod', 'pn-core-prod'],
};
