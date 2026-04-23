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
  for (const res of results) {
    resultMap[res.keyValue] = res.items as unknown[];
    totalItems += res.count;
  }

  script.prompt.spinnerStop(`Querying completed. Found ${totalItems} items across ${pks.length} PKs.`);

  return { resultMap, totalItems };
}
