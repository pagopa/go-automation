/**
 * Refusals that happen before any client is built.
 *
 * Production is a place to read and, behind the double confirmation of
 * `runSync`, to write: `--sync` there needs `--yes`-proof typed confirmation
 * of every production profile, which nothing but an operator at a terminal
 * can give. dev is out of scope.
 */

import type { SendSyncAnagraficaConfig } from '../types/index.js';
import { isProductionIdentifier } from '@go-automation/go-script';

/**
 * Refuses an environment this script does not serve.
 *
 * Production is always served, whatever `environments.allowed` says: it is
 * the write itself that is gated, per profile, in `runSync`.
 *
 * @param config - Validated configuration
 * @throws Error naming the environments that are accepted
 */
export function assertEnvironment(config: SendSyncAnagraficaConfig): void {
  if (isProductionIdentifier(config.env)) return;

  if (!config.environmentsAllowed.includes(config.env)) {
    throw new Error(
      `--env is '${config.env}', but this script serves ${config.environmentsAllowed.join(', ')} and production. ` +
        'dev is out of scope.',
    );
  }
}

/**
 * Refuses a profile that does not belong to the environment being read.
 *
 * The reference cannot get this wrong: `anagrafica_upsert` builds the profile
 * name from `--envName` itself (`sso_pn-<account>-<env>`), so the files it
 * reads and the tables it writes are always the same environment. Here the
 * two arrive independently -- `--env` picks the configuration tree, the
 * profiles pick the accounts -- and nothing tied them together, so
 * `--env hotfix` with uat profiles read the hotfix files and wrote the uat
 * tables, silently and with `--sync` confirmed.
 *
 * Checking that each profile carries the environment token restores the
 * reference's own guarantee rather than adding a rule of our own.
 *
 * @param config - Validated configuration
 * @throws Error naming the profiles that belong to another environment
 */
export function assertProfilesMatchEnvironment(config: SendSyncAnagraficaConfig): void {
  const foreign = config.awsProfiles.filter((profile) => !profile.includes(config.env));

  if (foreign.length > 0) {
    throw new Error(
      `--env is '${config.env}' but ${foreign.join(', ')} does not name that environment. ` +
        'Reading one environment and writing another is the one mistake this script must not make, ' +
        `so pass the '${config.env}' profiles instead.`,
    );
  }
}

/**
 * Refuses a table name the map does not declare.
 *
 * @param requested - Names passed on the command line
 * @param known - Names the table map declares
 * @throws Error naming the unknown table and listing the known ones
 */
export function assertKnownTables(requested: ReadonlyArray<string>, known: ReadonlyArray<string>): void {
  const unknown = requested.filter((name) => !known.includes(name));
  if (unknown.length > 0) {
    throw new Error(`Unknown table(s): ${unknown.join(', ')}. Declared: ${known.join(', ')}`);
  }
}
