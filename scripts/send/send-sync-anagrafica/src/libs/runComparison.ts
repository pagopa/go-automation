/**
 * Runs the comparison over both accounts.
 *
 * Each table is routed to the account that owns it, which is why the script
 * takes profiles plural: nine tables live on core and seven on confinfo, and a
 * read against the wrong account does not answer differently, it fails.
 */

import type { GOScript } from '@go-automation/go-script';
import { AWSDynamoDBService } from '@pagopa/go-aws/dynamodb';
import { profileForAccount } from './profileForAccount.js';
import { compareTable } from './compareTable.js';
import { loadRepositoryItems } from './loadRepositoryItems.js';
import type { RepositoryLayout } from './loadRepositoryItems.js';
import type { AnagraficaTable, SendSyncAnagraficaConfig, TableOutcome } from '../types/index.js';

/** Builds the repository layout the loader needs from the configuration. */
export function layoutOf(config: SendSyncAnagraficaConfig): RepositoryLayout {
  return {
    configPath: config.configPath,
    env: config.env,
    confDir: config.configurationConfDir,
    dynamodbDir: config.configurationDynamodbDir,
  };
}

/** The verdict for a table whose comparison produced these four categories. */
function verdict(
  table: AnagraficaTable,
  profile: string,
  source: string,
  comparison: ReturnType<typeof compareTable>,
): TableOutcome {
  const drift = comparison.different.length + comparison.onlyLive.length + comparison.onlyRepository.length;
  const protectedNote =
    comparison.protectedItems.length > 0 ? `, ${String(comparison.protectedItems.length)} protected` : '';

  // Takes precedence over drift. The file is claiming an item the table map
  // says belongs to the environment and to nothing else, and a sync built on
  // that file would overwrite it; which way the diff came out is secondary.
  if (comparison.protectedInFile.length > 0) {
    const keys = comparison.protectedInFile.map((entry) => entry.key).join(', ');
    return {
      table: table.name,
      account: table.account,
      profile,
      status: 'protected-in-file',
      detail: `${source} declares the protected key(s) ${keys}, which no file may carry`,
      ...comparison,
    };
  }

  return {
    table: table.name,
    account: table.account,
    profile,
    status: drift === 0 ? 'aligned' : 'drifted',
    detail:
      drift === 0
        ? `matches ${source}${protectedNote}`
        : `${String(comparison.different.length)} different, ${String(comparison.onlyLive.length)} only live, ` +
          `${String(comparison.onlyRepository.length)} only in the repository${protectedNote}`,
    ...comparison,
  };
}

/**
 * Compares one table, turning any failure into a reported outcome.
 *
 * @param service - DynamoDB service bound to the owning account
 * @param layout - Repository layout
 * @param table - Table declaration
 * @param profile - Profile the table was read with
 * @returns The outcome, never a thrown error
 */
export async function compareOne(
  service: AWSDynamoDBService,
  layout: RepositoryLayout,
  table: AnagraficaTable,
  profile: string,
): Promise<TableOutcome> {
  const empty = { different: [], onlyLive: [], onlyRepository: [], protectedItems: [], protectedInFile: [] };

  try {
    if (table.environments !== undefined && !table.environments.includes(layout.env)) {
      // Not read at all: a table that does not exist here would answer
      // ResourceNotFound, and a table with no file would answer missing-file,
      // and neither is a defect of this environment. A file may well be there
      // (the repository carries the paper tables' files for `test`, where the
      // tables are not provisioned), so it is named, not treated as an error.
      const ignored = await loadRepositoryItems(layout, table.account, table.name);
      const definedIn = table.environments.join(', ') || 'no environment yet';
      const note = ignored === undefined ? '' : `; ${ignored.source} is not compared`;

      return {
        table: table.name,
        account: table.account,
        profile,
        status: 'not-defined',
        detail: `not defined in ${layout.env} (defined in ${definedIn})${note}`,
        ...empty,
      };
    }

    const repository = await loadRepositoryItems(layout, table.account, table.name);
    if (repository === undefined) {
      return {
        table: table.name,
        account: table.account,
        profile,
        status: 'missing-file',
        detail: 'the table map declares it but the repository carries no file for it',
        ...empty,
      };
    }

    const live = await service.scanRaw(table.name);
    return verdict(table, profile, repository.source, compareTable(table, live, repository.items));
  } catch (error: unknown) {
    // A failed read is kept apart from an empty one: collapsing them would let
    // a denied scan read as "the table is empty", which is maximal drift.
    return {
      table: table.name,
      account: table.account,
      profile,
      status: 'failed',
      detail: (error as Error).message,
      ...empty,
    };
  }
}

/**
 * Compares every requested table across both accounts.
 *
 * @param script - The GOScript instance, for its client providers
 * @param config - Validated configuration
 * @param tables - Tables to compare
 * @returns One outcome per table, in declaration order
 */
export async function runComparison(
  script: GOScript,
  config: SendSyncAnagraficaConfig,
  tables: ReadonlyArray<AnagraficaTable>,
): Promise<ReadonlyArray<TableOutcome>> {
  const layout = layoutOf(config);
  const markers: Record<string, string> = {
    core: config.accountsCore,
    confinfo: config.accountsConfinfo,
  };

  const outcomes: TableOutcome[] = [];

  for (const account of ['core', 'confinfo']) {
    const wanted = tables.filter((table) => table.account === account);
    if (wanted.length === 0) continue;

    const marker = markers[account] ?? account;
    const profile = profileForAccount(config.awsProfiles, marker);
    const provider = script.aws.clients.getClientProvider(profile);
    const service = new AWSDynamoDBService(provider.dynamoDB);

    for (const table of wanted) {
      outcomes.push(await compareOne(service, layout, table, profile));
    }
  }

  return outcomes;
}
