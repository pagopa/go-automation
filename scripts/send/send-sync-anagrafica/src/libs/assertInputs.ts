/**
 * Refusals that happen before any client is built.
 *
 * The comparison is a read, and production is a legitimate place to read:
 * it is the reference for what a working environment looks like. `--sync`
 * writes, and on production it is refused, by the release-track policy that
 * production belongs to another team. That refusal does not depend on config:
 * go-script's production tokens and account ids always apply, and
 * `guard.prodProfileMarkers` can only add to them. dev is out of scope.
 */

import { isProductionIdentifier } from '@go-automation/go-script';
import type { AWSProfileSet } from '@pagopa/go-aws';
import { findProductionProfileVerdicts, formatProductionProfiles } from './productionTargets.js';
import type { SendSyncAnagraficaConfig } from '../types/index.js';

/**
 * Refuses an environment this script does not serve.
 *
 * Production is served for the comparison only, whatever `environments.allowed`
 * says: a list read from config is not what decides whether production is
 * written.
 *
 * @param config - Validated configuration
 * @throws Error naming the environments that are accepted
 */
export function assertEnvironment(config: SendSyncAnagraficaConfig): void {
  if (isProductionIdentifier(config.env)) {
    if (!config.sync) return;
    throw new Error(
      `--env '${config.env}' is production: the comparison is allowed, --sync is not. ` +
        'Production belongs to another team, and environments.allowed cannot change that.',
    );
  }

  if (!config.environmentsAllowed.includes(config.env)) {
    throw new Error(
      `--env is '${config.env}', but this script serves ${config.environmentsAllowed.join(', ')}, ` +
        'and production for the comparison only. dev is out of scope.',
    );
  }
}

/**
 * Refuses `--sync` on a production profile.
 *
 * Matched on the name, case-insensitively, and on the account the profile's
 * credentials resolve to, so a production profile named without a marker is
 * refused too.
 *
 * @param config - Validated configuration
 * @param profileSet - The run's profiles, resolved to their accounts
 * @throws Error naming the profile that was refused
 */
export async function assertNoProductionWrite(
  config: SendSyncAnagraficaConfig,
  profileSet: AWSProfileSet,
): Promise<void> {
  if (!config.sync) return;

  const production = await findProductionProfileVerdicts(
    profileSet,
    config.guardProdProfileMarkers,
    config.awsProfiles,
  );
  if (production.length > 0) {
    throw new Error(
      `Refusing --sync: ${formatProductionProfiles(production)}. Production belongs to another team. ` +
        'The comparison runs without --sync.',
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
