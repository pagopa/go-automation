/**
 * Queries DynamoDB for all partition keys in parallel batches.
 */

import { QueryCommand } from '@aws-sdk/client-dynamodb';
import type { QueryCommandInput, AttributeValue } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Core } from '@go-automation/go-common';

import { withRetry } from './withRetry.js';
import type { SendQueryDynamodbConfig } from '../types/index.js';
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
  config: SendQueryDynamodbConfig,
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

  script.prompt.startSpinner(`Querying ${pks.length} PKs...`);

  let totalItems = 0;
  const chunkSize = 10;

  for (let i = 0; i < pks.length; i += chunkSize) {
    const chunk = pks.slice(i, i + chunkSize);

    await Promise.all(
      chunk.map(async (pk) => {
        const items = await querySingleKey(pk, config, projection, isRaw, script);
        resultMap[pk] = items;
        totalItems += items.length;
      }),
    );

    script.prompt.updateSpinner(`Processed ${Math.min(i + chunkSize, pks.length)}/${pks.length} PKs...`);
  }

  script.prompt.spinnerStop(`Querying completed. Found ${totalItems} items across ${pks.length} PKs.`);

  return { resultMap, totalItems };
}

/**
 * Queries all pages for a single partition key.
 */
async function querySingleKey(
  pk: string,
  config: SendQueryDynamodbConfig,
  projection: string[] | undefined,
  isRaw: boolean,
  script: Core.GOScript,
): Promise<unknown[]> {
  const fullKey = `${config.keyPrefix ?? ''}${pk}${config.keySuffix ?? ''}`;
  const items: unknown[] = [];
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;

  do {
    const keyCondition = config.tableSortKey ? '#pk = :pkVal AND #sk = :skVal' : '#pk = :pkVal';

    const expressionNames: Record<string, string> = { '#pk': config.tableKey };
    const expressionValues: Record<string, AttributeValue> = { ':pkVal': { S: fullKey } };

    if (config.tableSortKey && config.tableSortValue) {
      expressionNames['#sk'] = config.tableSortKey;
      expressionValues[':skVal'] = { S: config.tableSortValue };
    }

    if (projection) {
      for (const [idx, attr] of projection.entries()) {
        expressionNames[`#attr${idx}`] = attr;
      }
    }

    const input: QueryCommandInput = {
      TableName: config.tableName,
      IndexName: config.indexName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
      ExclusiveStartKey: exclusiveStartKey,
      ...(projection && {
        ProjectionExpression: projection.map((_, idx) => `#attr${idx}`).join(', '),
      }),
    };

    const response = await withRetry(async () => script.aws.dynamoDB.send(new QueryCommand(input)));

    if (response.Items) {
      for (const item of response.Items) {
        items.push(isRaw ? item : unmarshall(item));
      }
    }
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey !== undefined);

  return items;
}
