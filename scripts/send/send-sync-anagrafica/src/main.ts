/**
 * Send Sync Anagrafica - Main Logic Module
 *
 * Compares the anagrafica tables of SEND against the files that declare them
 * in pn-configuration, in both directions: items the table holds and the
 * repository does not declare, items the repository declares and the table
 * does not hold, and items both sides have but disagree about.
 *
 * **Read-only unless `--sync` is passed.** Without it the run compares and
 * reports, which is what you want before anybody writes. With it, the items
 * the comparison found drifted are written back — and only those: the
 * reference re-writes every line of the file on every run.
 *
 * Nothing is ever deleted. Items the table holds and no file declares are
 * reported and left alone, because every request is a put.
 */

import type { GOScript } from '@go-automation/go-script';
import { GOPathType } from '@pagopa/go-common/files';
import {
  assertEnvironment,
  assertKnownTables,
  assertNoProductionWrite,
  assertProfilesMatchEnvironment,
} from './libs/assertInputs.js';
import { findUnconfiguredFiles } from './libs/findUnconfiguredFiles.js';
import { loadTableMap } from './libs/loadTableMap.js';
import {
  exportOutcomes,
  hasBlocking,
  needsAttention,
  renderOutcomes,
  renderSummary,
  unconfiguredOutcomes,
} from './libs/reportRenderer.js';
import { planSync } from './libs/planSync.js';
import { layoutOf, runComparison } from './libs/runComparison.js';
import { hasFailedWrites, runSync } from './libs/runSync.js';
import type { SendSyncAnagraficaConfig } from './types/index.js';

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: GOScript): Promise<void> {
  const config = await script.getConfiguration<SendSyncAnagraficaConfig>();

  assertEnvironment(config);
  assertProfilesMatchEnvironment(config);
  await assertNoProductionWrite(config, script.aws.clients);

  const tablesPath = script.paths.resolvePath(config.configurationTablesFile, GOPathType.CONFIG);
  const declared = await loadTableMap(tablesPath);
  assertKnownTables(config.tableNames, [...declared.map((table) => table.name)]);

  const restricted = config.tableNames.length > 0;
  const wanted = restricted ? declared.filter((table) => config.tableNames.includes(table.name)) : declared;

  script.logger.info(`Comparing ${String(wanted.length)} table(s) of ${config.env} against ${config.configPath}`);

  const compared = await runComparison(script, config, wanted);

  // Undeclared files are only meaningful over the whole map: on a run
  // restricted by name, every other file is undeclared by construction.
  const unconfigured = restricted
    ? []
    : await findUnconfiguredFiles(
        layoutOf(config),
        [config.accountsCore, config.accountsConfinfo],
        [...declared.map((table) => table.name)],
      );

  const outcomes = [...compared, ...unconfiguredOutcomes(unconfigured)];

  renderOutcomes(script, outcomes);
  renderSummary(script, outcomes);
  await exportOutcomes(script, config.outputFile, config.outputFormat, outcomes);

  // Two different questions. `unanswered` is every table the comparison could
  // not speak for, and the confirmation names them whatever the exit code is.
  // `blocked` is the narrower set that fails the run.
  const unanswered = outcomes.filter((outcome) => needsAttention(outcome));
  const blocked = outcomes.filter((outcome) => hasBlocking([outcome], config.strictConfiguration));

  if (!config.sync) {
    script.logger.info('Report only. Pass --sync to write the drift back.');
    if (blocked.length > 0) process.exitCode = 1;
    return;
  }

  // Refuses the whole run, not just the table it was found on. The others are
  // written from the same repository, and a file declaring an item the
  // environment owns says that file set is not to be trusted wholesale.
  if (outcomes.some((outcome) => outcome.status === 'protected-in-file')) {
    script.logger.error('Refusing to write: a configuration file declares a protected item.');
    process.exitCode = 1;
    return;
  }

  // The rest is per table. A table that could not be read is never planned —
  // only a drifted one is — so a failed read cannot turn into a write, and
  // refusing the whole run over it would only make --sync unusable on an
  // environment where two tables have no file at all.
  const results = await runSync(script, config, planSync(outcomes, wanted), unanswered.length);

  if (results === undefined || hasFailedWrites(results) || blocked.length > 0) process.exitCode = 1;
}
