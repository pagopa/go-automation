/**
 * Where the services of one occurrence read the product logs.
 *
 * - `oam-target`: through OAM, from the account that holds the credentials (the
 *   Watchtower account or the monitoring account) towards the occurrence's
 *   source account and region. It is the mode of the Lambda and of local runs
 *   with a personal profile in that account.
 * - `configured-profiles`: directly with the configured profiles, which already
 *   belong to the product accounts. It is the mode of the scripts of this
 *   repository run with `--aws-profiles`.
 */
export type OccurrenceServiceBindingMode = 'oam-target' | 'configured-profiles';
