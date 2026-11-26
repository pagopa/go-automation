/**
 * The pre-write snapshot: what the table holds now, for every item a sync is
 * about to overwrite.
 *
 * A `PutRequest` substitutes the whole item and an `UpdateItem` changes
 * attributes in place, and neither leaves the previous value anywhere. The
 * comparison report is optional and was never meant as a backup, so the sync
 * takes its own copy first and **refuses to write without it**.
 *
 * Only items that exist today are saved: a create has nothing to lose. Protected
 * items never reach a plan, so they are not here either.
 *
 * The files are NDJSON in DynamoDB wire form, one item per line, the same shape
 * as the repository's table files: a snapshot can be read back by anything that
 * reads those, and it is not unmarshalled, so `{"N":"1.0"}` stays `{"N":"1.0"}`.
 */

import type { GOScript } from '@go-automation/go-script';
import { GOPathType } from '@pagopa/go-common/files';
import { createRowListExporter } from './createRowListExporter.js';
import type { TableSyncPlan } from './planSync.js';

/** Directory, inside the run's output directory, that holds the snapshots. */
const SNAPSHOT_DIRECTORY = 'pre-sync';

/** One table's snapshot file. */
export interface TableSnapshot {
  /** Table name. */
  readonly table: string;

  /** Absolute path of the file. */
  readonly path: string;

  /** Items saved in it. */
  readonly items: number;
}

/** The live items a plan would overwrite. */
function overwrittenItems(plan: TableSyncPlan): ReadonlyArray<Record<string, unknown>> {
  return plan.writes.flatMap((write) => (write.reason === 'overwrite' && write.live !== undefined ? [write.live] : []));
}

/**
 * Writes one snapshot file per table that has something to overwrite.
 *
 * @param script - The GOScript instance, for paths and logging
 * @param plans - What the sync is about to write
 * @returns The files written, in plan order; empty when the sync only creates items
 * @throws Error naming the table when a snapshot cannot be written, so no write is sent
 */
export async function snapshotPlans(
  script: GOScript,
  plans: ReadonlyArray<TableSyncPlan>,
): Promise<ReadonlyArray<TableSnapshot>> {
  const snapshots: TableSnapshot[] = [];

  for (const plan of plans) {
    const items = overwrittenItems(plan);
    if (items.length === 0) continue;

    const outputPath = script.paths.resolvePath(`${SNAPSHOT_DIRECTORY}/${plan.table}.json`, GOPathType.OUTPUT);
    try {
      await createRowListExporter(outputPath, 'jsonl').export(items);
    } catch (error: unknown) {
      throw new Error(
        `Could not save the pre-write snapshot of ${plan.table} to ${outputPath}: ${(error as Error).message}. ` +
          'Nothing was written.',
        { cause: error },
      );
    }

    snapshots.push({ table: plan.table, path: outputPath, items: items.length });
  }

  if (snapshots.length > 0) {
    script.logger.section('Pre-write snapshot');
    for (const snapshot of snapshots) {
      script.logger.success(`${snapshot.table}: ${String(snapshot.items)} item(s) saved to ${snapshot.path}`);
    }
  }

  return snapshots;
}
