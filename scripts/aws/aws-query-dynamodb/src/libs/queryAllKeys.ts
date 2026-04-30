/**
 * Queries DynamoDB for all partition keys in parallel batches.
 */

import { Core, AWS } from '@go-automation/go-common';
import type { AwsQueryDynamodbConfig, QueryFailure, ResultMap } from '../types/index.js';

/**
 * Result of {@link queryAllKeys}.
 */
interface QueryAllKeysResult {
  /** PK -> items map. Every input PK is present (empty array on missing data or failure). */
  readonly resultMap: ResultMap;
  /** Sum of items across successful queries. */
  readonly totalItems: number;
  /** One entry per failed query (empty when nothing failed). */
  readonly failures: ReadonlyArray<QueryFailure>;
}

/**
 * Queries DynamoDB for every partition key and returns a result map.
 * Keys are processed in parallel by a worker pool (see DynamoDBQueryService).
 *
 * The returned `resultMap` always contains every input PK as a key — failed and
 * empty-result PKs both map to `[]`. Failures are reported separately via the
 * `failures` array so the caller can distinguish "no data" from "query errored".
 *
 * @param pks - Deduplicated partition keys
 * @param config - Script configuration
 * @param script - GOScript instance for AWS client and spinner
 */
export async function queryAllKeys(
  pks: ReadonlyArray<string>,
  config: AwsQueryDynamodbConfig,
  script: Core.GOScript,
): Promise<QueryAllKeysResult> {
  const isRaw = config.outputFormat === 'dynamo-json';
  const projection = config.outputAttributes
    ? config.outputAttributes
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a !== '')
    : undefined;

  // Pre-initialise so every input PK is present in the output mapping (even on failure).
  const resultMap: ResultMap = {};
  for (const pk of pks) {
    resultMap[pk] = [];
  }

  const queryService = new AWS.DynamoDBQueryService(script.aws.dynamoDB);

  script.prompt.startSpinner(`Querying ${pks.length} PKs...`);

  const results = await queryService
    .queryMultipleByPartitionKey(
      pks,
      {
        tableName: config.tableName,
        keyName: config.tableKey,
        prefix: config.keyPrefix,
        suffix: config.keySuffix,
        indexName: config.indexName,
        sortKeyName: config.tableSortKey,
        sortKeyValue: config.tableSortValue,
        projection,
        isRaw,
        failFast: config.failureMode === 'abort',
      },
      (processed: number, total: number) => {
        script.prompt.updateSpinner(`Processed ${processed}/${total} PKs...`);
      },
    )
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      script.prompt.spinnerFail(`Querying aborted: ${message}`);
      throw error;
    });

  let totalItems = 0;
  const failures: QueryFailure[] = [];
  for (const res of results) {
    if (res.error) {
      failures.push({
        keyValue: res.keyValue,
        fullKey: res.fullKey,
        error: res.error.message,
      });
      script.logger.error(`Query failed for "${res.keyValue}": ${res.error.message}`);
      continue;
    }
    resultMap[res.keyValue] = res.items as unknown[];
    totalItems += res.count;
  }

  const successful = pks.length - failures.length;
  const completionMessage =
    failures.length > 0
      ? `Querying completed with ${failures.length} failures. Found ${totalItems} items across ${successful} PKs.`
      : `Querying completed. Found ${totalItems} items across ${pks.length} PKs.`;
  script.prompt.spinnerStop(completionMessage);

  return { resultMap, totalItems, failures };
}
