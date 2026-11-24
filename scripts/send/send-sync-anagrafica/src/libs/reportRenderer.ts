/**
 * Rendering, export and exit code.
 *
 * The exit code says something narrow on purpose: **drift is not a failure**
 * in a comparison run, it is the answer that was asked for. What fails the run
 * is not being able to answer — a scan that was refused, a file that would not
 * parse — and a file declaring an item the environment owns.
 *
 * A table configured with no file, and a file configured nowhere, are *also*
 * things the comparison could not answer, but they are not failures of this
 * run: `pn-AuthJwtIssuers` and `pn-AuthJwtAttributes` are declared and have no
 * file in any of the five trees, so a full run exited 1 on every single
 * environment. They are reported in full, counted as needing attention, and
 * `--strict-configuration` is how an operator asks for them to fail the run.
 */

import type { GOScript } from '@go-automation/go-script';
import type { GOExportFormat } from '@pagopa/go-common/exporters';
import { GOPathType } from '@pagopa/go-common/files';
import { createRowListExporter } from './createRowListExporter.js';
import type { TableOutcome, TableStatus } from '../types/index.js';
import type { UnconfiguredFile } from './findUnconfiguredFiles.js';

/** Statuses that mean the run could not answer for a table. */
const UNANSWERED: ReadonlyArray<TableStatus> = ['missing-file', 'unconfigured', 'failed'];

/** Statuses that fail the run whatever was asked for. */
const ALWAYS_BLOCKING: ReadonlyArray<TableStatus> = ['failed', 'protected-in-file'];

/** Statuses that fail the run only under `--strict-configuration`. */
const STRICT_ONLY: ReadonlyArray<TableStatus> = ['missing-file', 'unconfigured'];

/** How many differing items are listed before the report file takes over. */
const SAMPLE_SIZE = 5;

/**
 * Prints one line per table, plus a sample of what differs.
 *
 * @param script - The GOScript instance
 * @param outcomes - Every table outcome
 */
export function renderOutcomes(script: GOScript, outcomes: ReadonlyArray<TableOutcome>): void {
  let account = '';

  for (const outcome of outcomes) {
    if (outcome.account !== account) {
      account = outcome.account;
      script.logger.section(`${account} (${outcome.profile})`);
    }

    const line = `${outcome.table}: ${outcome.detail}`;
    if (UNANSWERED.includes(outcome.status) || outcome.status === 'protected-in-file') {
      script.logger.error(line);
      continue;
    }
    if (outcome.status === 'drifted') {
      script.logger.warning(line);
      renderSample(script, outcome);
      continue;
    }
    script.logger.success(line);
  }
}

/** Prints the first few differing keys, so a run is readable without the file. */
function renderSample(script: GOScript, outcome: TableOutcome): void {
  const rows = [
    ...outcome.different.map((entry) => `differs: ${entry.key}`),
    ...outcome.onlyLive.map((entry) => `only in the table: ${entry.key}`),
    ...outcome.onlyRepository.map((entry) => `only in the repository: ${entry.key}`),
  ];

  for (const row of rows.slice(0, SAMPLE_SIZE)) script.logger.text(`    ${row}`);
  if (rows.length > SAMPLE_SIZE) {
    script.logger.text(`    … ${String(rows.length - SAMPLE_SIZE)} more, in the report`);
  }
}

/**
 * Prints the tally.
 *
 * @param script - The GOScript instance
 * @param outcomes - Every table outcome
 */
export function renderSummary(script: GOScript, outcomes: ReadonlyArray<TableOutcome>): void {
  const count = (status: TableStatus): number => outcomes.filter((outcome) => outcome.status === status).length;
  const items = outcomes.reduce(
    (total, outcome) => total + outcome.different.length + outcome.onlyLive.length + outcome.onlyRepository.length,
    0,
  );
  const guarded = outcomes.reduce((total, outcome) => total + outcome.protectedItems.length, 0);

  script.logger.section('Summary');
  script.logger.info(
    `${String(outcomes.length)} table(s): ${String(count('aligned'))} aligned, ` +
      `${String(count('drifted'))} drifted, ` +
      `${String(outcomes.filter((outcome) => needsAttention(outcome)).length)} needing attention`,
  );
  script.logger.info(`${String(items)} item(s) differ; ${String(guarded)} protected item(s) are expected live-only`);
}

/**
 * Turns undeclared files into outcomes, so they appear in one report.
 *
 * @param files - Files the map declares nowhere
 * @returns One outcome per file
 */
export function unconfiguredOutcomes(files: ReadonlyArray<UnconfiguredFile>): ReadonlyArray<TableOutcome> {
  return files.map((file) => ({
    table: file.name,
    account: file.account,
    profile: '',
    status: 'unconfigured' as const,
    detail: `${file.source} is in the repository but no table map entry points at it`,
    different: [],
    onlyLive: [],
    onlyRepository: [],
    protectedItems: [],
    protectedInFile: [],
  }));
}

/**
 * Writes the full report, which is the only place every differing item appears.
 *
 * @param script - The GOScript instance
 * @param outputFile - File name, or undefined to write nothing
 * @param format - Export format
 * @param outcomes - Every table outcome
 */
export async function exportOutcomes(
  script: GOScript,
  outputFile: string | undefined,
  format: GOExportFormat,
  outcomes: ReadonlyArray<TableOutcome>,
): Promise<void> {
  if (outputFile === undefined || outcomes.length === 0) return;

  const outputPath = script.paths.resolvePath(outputFile, GOPathType.OUTPUT);
  // The full items go in the report and nowhere else, so the rows carry them
  // whole rather than a rendered summary that would have to be read back.
  const rows: ReadonlyArray<Record<string, unknown>> = outcomes.map((outcome) => ({ ...outcome }));
  await createRowListExporter(outputPath, format).export(rows);
  script.logger.success(`Report written to: ${outputPath}`);
}

/**
 * Whether a table was left without an answer, whatever the exit code says.
 *
 * Kept apart from `hasBlocking` because the confirmation question has to name
 * these even when they do not fail the run: approving a write while part of
 * the comparison came back unanswered is a thing the operator should be told.
 *
 * @param outcome - One table outcome
 * @returns Whether the comparison could not answer for it
 */
export function needsAttention(outcome: TableOutcome): boolean {
  return UNANSWERED.includes(outcome.status) || outcome.status === 'protected-in-file';
}

/**
 * Whether the run could not answer, which is the only thing that fails it.
 *
 * @param outcomes - Every table outcome
 * @param strictConfiguration - Whether a table or file with no counterpart fails the run
 * @returns Whether any outcome is blocking
 */
export function hasBlocking(outcomes: ReadonlyArray<TableOutcome>, strictConfiguration: boolean): boolean {
  const blocking = strictConfiguration ? [...ALWAYS_BLOCKING, ...STRICT_ONLY] : ALWAYS_BLOCKING;

  return outcomes.some((outcome) => blocking.includes(outcome.status));
}
