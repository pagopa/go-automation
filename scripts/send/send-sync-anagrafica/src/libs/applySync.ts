/**
 * Executes one table's plan.
 *
 * Both paths report what they could not write rather than how many calls they
 * made. `batchWriteItemRaw` hands back the items DynamoDB rejected after its
 * retry budget — the reference ignores that field entirely and prints
 * `inserted successfully` over a half-written batch — and the merge path
 * catches per item, so one bad item does not take the other fifteen with it.
 */

import type { GOScript } from '@go-automation/go-script';
import type { AWSDynamoDBService } from '@pagopa/go-aws/dynamodb';
import { displayKey, itemKey } from './itemKey.js';
import { splitKey } from './planSync.js';
import type { TableSyncPlan } from './planSync.js';

/** What writing one table actually did. */
export interface TableSyncResult {
  /** Table name. */
  readonly table: string;

  /** Items the table accepted. */
  readonly written: number;

  /** Keys of the items that were not written. */
  readonly failed: ReadonlyArray<string>;

  /** Why the whole table failed, when it did. */
  readonly error: string | undefined;
}

/** Writes a replace-mode table in batches, reporting the rejected items. */
async function applyReplace(
  script: GOScript,
  service: AWSDynamoDBService,
  plan: TableSyncPlan,
): Promise<TableSyncResult> {
  const items = plan.writes.map((write) => write.item);

  const result = await service.batchWriteItemRaw(plan.table, items, {
    onRetry: (remaining, attempt) => {
      script.logger.warning(`${plan.table}: DynamoDB rejected ${String(remaining)} item(s), retry ${String(attempt)}`);
    },
  });

  return {
    table: plan.table,
    written: result.written,
    failed: result.unprocessed.map((item) => displayKey(itemKey(item, plan.keys))),
    error: undefined,
  };
}

/** Writes a merge-mode table one item at a time, setting only declared attributes. */
async function applyMerge(service: AWSDynamoDBService, plan: TableSyncPlan): Promise<TableSyncResult> {
  let written = 0;
  const failed: string[] = [];

  for (const write of plan.writes) {
    try {
      const { key, attributes } = splitKey(write.item, plan.keys);
      await service.updateItemRaw(plan.table, key, attributes);
      written += 1;
    } catch {
      // Kept per item on purpose: a merge is a loop of independent updates, so
      // one rejected item says nothing about the next.
      failed.push(write.key);
    }
  }

  return { table: plan.table, written, failed, error: undefined };
}

/**
 * Writes one table's plan.
 *
 * @param script - The GOScript instance, for progress logging
 * @param service - DynamoDB service bound to the owning account
 * @param plan - The writes for this table
 * @returns What was written, and what was not
 */
export async function applyPlan(
  script: GOScript,
  service: AWSDynamoDBService,
  plan: TableSyncPlan,
): Promise<TableSyncResult> {
  if (plan.writes.length === 0) {
    return { table: plan.table, written: 0, failed: [], error: undefined };
  }

  try {
    return plan.syncMode === 'merge' ? await applyMerge(service, plan) : await applyReplace(script, service, plan);
  } catch (error: unknown) {
    // A thrown error is the whole table failing — a denied write, a table that
    // is not there — which is a different answer from items being rejected.
    return {
      table: plan.table,
      written: 0,
      failed: plan.writes.map((write) => write.key),
      error: (error as Error).message,
    };
  }
}
