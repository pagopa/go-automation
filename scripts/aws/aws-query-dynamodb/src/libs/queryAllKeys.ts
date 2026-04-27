/**
 * Queries DynamoDB for all partition keys in parallel batches.
 */

import { Core, AWS } from '@go-automation/go-common';
import type { AwsQueryDynamodbConfig } from '../types/index.js';
import type { ResultMap } from '../types/ResultMap.js';

/**
 * Queries DynamoDB for every partition key and returns a result map.
 * Keys are processed in parallel batches of 10.
 *
 * @param pks - Deduplicated partition keys
 * @param config - Script configuration
 * @param script - GOScript instance for AWS client and spinner
 * @returns Result map and total item count
 */
export async function queryAllKeys(
  pks: ReadonlyArray<string>,
  config: AwsQueryDynamodbConfig,
  script: Core.GOScript,
): Promise<{ resultMap: ResultMap; totalItems: number }> {
  const resultMap: ResultMap = {};
  const isRaw = config.outputFormat === 'dynamo-json';
  const projection = config.outputAttributes
    ? config.outputAttributes
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a !== '')
    : undefined;

  const queryService = new AWS.DynamoDBQueryService(script.aws.dynamoDB);

  script.prompt.startSpinner(`Querying ${pks.length} PKs...`);

  const results = await queryService.queryMultipleByPartitionKey(
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
    },
    (processed: number, total: number) => {
      script.prompt.updateSpinner(`Processed ${processed}/${total} PKs...`);
    },
  );

  let totalItems = 0;
  let failures = 0;
  for (const res of results) {
    if (res.error) {
      failures++;
      script.logger.error(`Query failed for "${res.keyValue}": ${res.error.message}`);
      continue;
    }
    resultMap[res.keyValue] = res.items as unknown[];
    totalItems += res.count;
  }

  const successful = pks.length - failures;
  const completionMessage =
    failures > 0
      ? `Querying completed with ${failures} failures. Found ${totalItems} items across ${successful} PKs.`
      : `Querying completed. Found ${totalItems} items across ${pks.length} PKs.`;
  script.prompt.spinnerStop(completionMessage);

  return { resultMap, totalItems };
}
