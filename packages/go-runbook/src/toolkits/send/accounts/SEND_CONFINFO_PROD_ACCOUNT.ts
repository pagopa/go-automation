import type { AwsAccountSource } from '../../common/accounts/AwsAccountSource.js';

/** SEND confinfo production account (it also hosts SPID hub) and the local profile that reaches it. */
export const SEND_CONFINFO_PROD_ACCOUNT: AwsAccountSource = {
  name: 'confinfo',
  accountId: '350578575906',
  profiles: ['sso_pn-confinfo-prod'],
};
