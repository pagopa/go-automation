/**
 * The write half: show the plan, ask, then write.
 *
 * The confirmation is asked **before** the dry run is considered, with
 * different wording, so `--dry-run` reports what a confirmed run would do
 * instead of being the way past the question. Same discipline as
 * `send-apply-system-params`.
 */

import { type GOScript, confirmWriteWithProduction } from '@go-automation/go-script';
import { AWSDynamoDBService } from '@pagopa/go-aws/dynamodb';
import { applyPlan } from './applySync.js';
import type { TableSyncResult } from './applySync.js';
import type { TableSyncPlan } from './planSync.js';
import { resolveProductionTargets } from './productionTargets.js';
import type { SendSyncAnagraficaConfig } from '../types/index.js';

/** How many writes are listed per table before the count takes over. */
const SAMPLE_SIZE = 5;

/** Items a plan would write, over every table. */
function totalWrites(plans: ReadonlyArray<TableSyncPlan>): number {
  return plans.reduce((total, plan) => total + plan.writes.length, 0);
}

/** Prints what the sync would do, loudest where it would delete something. */
function renderPlans(script: GOScript, plans: ReadonlyArray<TableSyncPlan>): void {
  script.logger.section('Planned writes');

  for (const plan of plans) {
    if (plan.writes.length === 0) {
      script.logger.info(
        `${plan.table}: nothing to write; ${String(plan.untouched)} item(s) exist only in the table and no sync removes them`,
      );
      continue;
    }

    const creates = plan.writes.filter((write) => write.reason === 'create').length;
    script.logger.warning(
      `${plan.table} (${plan.syncMode}): ${String(plan.writes.length)} write(s) — ` +
        `${String(creates)} create, ${String(plan.writes.length - creates)} overwrite`,
    );

    for (const write of plan.writes.slice(0, SAMPLE_SIZE)) {
      script.logger.text(`    ${write.reason}: ${write.key}`);
    }
    if (plan.writes.length > SAMPLE_SIZE) {
      script.logger.text(`    … ${String(plan.writes.length - SAMPLE_SIZE)} more`);
    }

    renderDropped(script, plan);

    if (plan.untouched > 0) {
      script.logger.text(`    ${String(plan.untouched)} item(s) exist only in the table and are left alone`);
    }
  }
}

/** Names the attributes a replace would delete, which no diff of items shows. */
function renderDropped(script: GOScript, plan: TableSyncPlan): void {
  const dropping = plan.writes.filter((write) => write.droppedAttributes.length > 0);
  if (dropping.length === 0) return;

  script.logger.error(`    ${String(dropping.length)} write(s) would DELETE attributes the table holds today:`);
  for (const write of dropping) {
    script.logger.error(`      ${write.key}: ${write.droppedAttributes.join(', ')}`);
  }
}

/** Prints what the writes actually did. */
function renderResults(script: GOScript, results: ReadonlyArray<TableSyncResult>): void {
  script.logger.section('Write results');

  for (const result of results) {
    if (result.error !== undefined) {
      script.logger.error(`${result.table}: ${result.error}`);
      continue;
    }
    if (result.failed.length > 0) {
      script.logger.error(
        `${result.table}: ${String(result.written)} written, ${String(result.failed.length)} NOT written — ${result.failed.join(
          ', ',
        )}`,
      );
      continue;
    }
    script.logger.success(`${result.table}: ${String(result.written)} written`);
  }
}

/**
 * Asks the operator, through the two shared gates of go-script.
 *
 * `--yes` answers the yes/no up front; a dry run with nobody to ask previews anyway, since it
 * writes nothing; a real run with nobody to ask throws instead of exiting quietly.
 *
 * Every production profile a write goes through must then be typed back, which
 * `--yes` never answers and which needs a terminal: a production write cannot
 * run unattended.
 */
async function confirm(
  script: GOScript,
  config: SendSyncAnagraficaConfig,
  plans: ReadonlyArray<TableSyncPlan>,
  question: string,
): Promise<boolean> {
  const written = [...new Set(plans.filter((plan) => plan.writes.length > 0).map((plan) => plan.profile))];

  return await confirmWriteWithProduction(script.prompt, script.logger, {
    question,
    targets: await resolveProductionTargets(script.aws.clients, written, config.guardProdProfileMarkers),
    assumeYes: config.yes,
    isDryRun: config.dryRun,
    canPromptUser: script.environment.canPromptUser,
  });
}

/**
 * Shows the plan, asks, and writes.
 *
 * @param script - The GOScript instance, for prompts and client providers
 * @param config - Validated configuration
 * @param plans - What the comparison says would be written
 * @param unanswered - Tables the comparison could not answer for
 * @returns The results, or undefined when the operator refused
 */
export async function runSync(
  script: GOScript,
  config: SendSyncAnagraficaConfig,
  plans: ReadonlyArray<TableSyncPlan>,
  unanswered: number = 0,
): Promise<ReadonlyArray<TableSyncResult> | undefined> {
  const writes = totalWrites(plans);

  if (writes === 0) {
    script.logger.success('Nothing to write: no item differs from the repository.');
    return [];
  }

  renderPlans(script, plans);

  const dropping = plans.reduce(
    (total, plan) => total + plan.writes.filter((write) => write.droppedAttributes.length > 0).length,
    0,
  );
  const warning = dropping > 0 ? ` ${String(dropping)} of them DELETE attributes that exist today.` : '';

  // Said in the question and not only in the log above it. Those tables are
  // not written either way — nothing plans a write off a comparison that did
  // not finish — but approving a write while part of the run came back
  // unanswered is a thing the operator should be told at the moment of asking.
  const unansweredNote =
    unanswered > 0 ? ` ${String(unanswered)} table(s) could NOT be compared and are left untouched.` : '';

  const question = config.dryRun
    ? `Dry run — nothing will be written. ${String(writes)} item(s) above would be written.` +
      `${warning}${unansweredNote} Continue?`
    : `WRITE the ${String(writes)} item(s) above to DynamoDB on ${config.env}?${warning}${unansweredNote}`;

  if (!(await confirm(script, config, plans, question))) return undefined;

  if (config.dryRun) {
    script.logger.warning('Dry run: no write was sent to DynamoDB.');
    return [];
  }

  const results: TableSyncResult[] = [];
  for (const plan of plans) {
    if (plan.writes.length === 0) continue;

    const provider = script.aws.clients.getClientProvider(plan.profile);
    const service = new AWSDynamoDBService(provider.dynamoDB);
    results.push(await applyPlan(script, service, plan));
  }

  renderResults(script, results);
  return results;
}

/**
 * Whether any write did not land, which fails the run.
 *
 * @param results - What the writes did
 * @returns Whether anything was refused or rejected
 */
export function hasFailedWrites(results: ReadonlyArray<TableSyncResult>): boolean {
  return results.some((result) => result.error !== undefined || result.failed.length > 0);
}
