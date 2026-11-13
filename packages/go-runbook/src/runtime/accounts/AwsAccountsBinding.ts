/**
 * How an execution reaches the logical accounts (EVO-AWSACCT-OPUS-01 §6.1):
 * - `profiles`: local profiles, any name, matched to the account through STS;
 * - `oam`: an identity in the monitoring account, reading through OAM (always in cloud).
 */
export type AwsAccountsBinding = 'profiles' | 'oam';
