/**
 * How an execution reaches the logical accounts:
 * - `profiles`: local profiles, any name, matched to the account through STS;
 * - `oam`: an identity in the monitoring account, reading through OAM (always in cloud).
 */
export type AwsAccountsBinding = 'profiles' | 'oam';
