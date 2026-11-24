import type {
  DynamoDBClient,
  QueryCommandInput,
  QueryCommandOutput,
  ScanCommandInput,
  ScanCommandOutput,
} from '@aws-sdk/client-dynamodb';
import {
  BatchWriteItemCommand,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import type { AttributeValue, BatchWriteItemCommandOutput, WriteRequest } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { GOBackoff, GODefaultSleeper } from '@pagopa/go-common/polling';

import type { DynamoDBBatchWriteOptions, DynamoDBBatchWriteResult } from './models/DynamoDBBatchWriteResult.js';

/** Default maximum number of items returned by a query to prevent unbounded memory growth. */
const DEFAULT_MAX_ITEMS = 10_000;

/** Hard ceiling DynamoDB places on a single `BatchWriteItem` request. */
const BATCH_WRITE_MAX_ITEMS = 25;

/** Default number of times a batch carrying unprocessed items is re-sent. */
const BATCH_WRITE_MAX_RETRIES = 5;

/** Base delay (ms) before re-sending the unprocessed part of a batch. */
const BATCH_WRITE_RETRY_BASE_MS = 200;

/** Cap (ms) on the delay before re-sending the unprocessed part of a batch. */
const BATCH_WRITE_RETRY_CAP_MS = 5000;

/**
 * DynamoDB service wrapper for generic query, get, update and put operations.
 *
 * This complements {@link DynamoDBQueryService}, which focuses on partition-key
 * batch queries with prefix/suffix support.
 */
export class AWSDynamoDBService {
  constructor(private readonly client: DynamoDBClient) {}

  /**
   * Queries a DynamoDB table with automatic pagination.
   * Stops after `maxItems` to prevent unbounded memory growth on large result sets.
   *
   * @param tableName - Table name
   * @param keyConditionExpression - Key condition expression
   * @param expressionAttributeValues - Expression attribute values
   * @param expressionAttributeNames - Optional expression attribute names
   * @param maxItems - Maximum items to return
   * @param signal - Optional abort signal to cancel the query
   * @returns Unmarshalled items
   */
  async query(
    tableName: string,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, AttributeValue>,
    expressionAttributeNames?: Record<string, string>,
    maxItems: number = DEFAULT_MAX_ITEMS,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<Record<string, unknown>>> {
    const items: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, AttributeValue> | undefined;
    const sendOptions = signal !== undefined ? { abortSignal: signal } : undefined;

    do {
      const input: QueryCommandInput = {
        TableName: tableName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExclusiveStartKey: exclusiveStartKey,
      };

      if (expressionAttributeNames !== undefined) {
        input.ExpressionAttributeNames = expressionAttributeNames;
      }

      const response: QueryCommandOutput = await this.client.send(new QueryCommand(input), sendOptions);

      if (response.Items) {
        for (const item of response.Items) {
          items.push(unmarshall(item));
        }
      }

      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey !== undefined && items.length < maxItems);

    return items;
  }

  /**
   * Gets a single item from DynamoDB.
   *
   * @param tableName - Table name
   * @param key - Item key as a plain object
   * @param signal - Optional abort signal to cancel the request
   * @returns The unmarshalled item, or undefined if not found
   */
  async getItem(
    tableName: string,
    key: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown> | undefined> {
    const response = await this.client.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall(key),
      }),
      ...(signal !== undefined ? [{ abortSignal: signal }] : []),
    );

    if (response.Item === undefined) {
      return undefined;
    }

    return unmarshall(response.Item);
  }

  /**
   * Updates an item in DynamoDB.
   *
   * @param tableName - Table name
   * @param key - Item key as a plain object
   * @param updateExpression - Update expression
   * @param expressionAttributeValues - Expression attribute values as plain objects
   * @param expressionAttributeNames - Optional expression attribute names
   * @param signal - Optional abort signal to cancel the request
   */
  async updateItem(
    tableName: string,
    key: Record<string, unknown>,
    updateExpression: string,
    expressionAttributeValues: Record<string, unknown>,
    expressionAttributeNames?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.client.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: marshall(key),
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: marshall(expressionAttributeValues),
        ExpressionAttributeNames: expressionAttributeNames,
      }),
      ...(signal !== undefined ? [{ abortSignal: signal }] : []),
    );
  }

  /**
   * Puts an item into DynamoDB.
   *
   * @param tableName - Table name
   * @param item - Item to put as a plain object
   * @param signal - Optional abort signal to cancel the request
   */
  async putItem(tableName: string, item: Record<string, unknown>, signal?: AbortSignal): Promise<void> {
    await this.client.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall(item),
      }),
      ...(signal !== undefined ? [{ abortSignal: signal }] : []),
    );
  }

  /**
   * Scans a whole table, returning every item in its DynamoDB **wire form**.
   *
   * Deliberately not unmarshalled, which is why the name says so: `query` and
   * `getItem` hand back plain values because their callers want values, but a
   * configuration-parity check compares *representations*. Unmarshalling
   * collapses distinctions the table really holds — `{"N":"1.0"}` and
   * `{"N":"1"}` become the same number, a string set loses its ordering — so a
   * diff built on unmarshalled items reports two different tables as identical.
   *
   * It also keeps the comparison usable from a script, which may not depend on
   * the AWS SDK and so cannot unmarshall the other side of the diff itself.
   *
   * Every page is read: a Scan is the only way to ask "what is actually in this
   * table", and a partial answer would read as missing items.
   *
   * @param tableName - Table name
   * @param signal - Optional abort signal to cancel the scan
   * @returns Every item, each still in its attribute-value form
   */
  async scanRaw(tableName: string, signal?: AbortSignal): Promise<ReadonlyArray<Record<string, unknown>>> {
    const items: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, AttributeValue> | undefined;
    const sendOptions = signal !== undefined ? { abortSignal: signal } : undefined;

    do {
      const input: ScanCommandInput = { TableName: tableName, ExclusiveStartKey: exclusiveStartKey };
      const response: ScanCommandOutput = await this.client.send(new ScanCommand(input), sendOptions);

      if (response.Items) items.push(...response.Items);

      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey !== undefined);

    return items;
  }

  /**
   * Updates an item from attributes already in DynamoDB **wire form**, merging
   * them into whatever the table holds.
   *
   * This is the `SET`-only counterpart of {@link batchWriteItemRaw}: attributes
   * the caller does not name are left exactly as they are, where a put replaces
   * the whole item. A table whose configuration file carries only part of each
   * item needs this one, and reaching for the put would silently delete the
   * rest.
   *
   * Placeholders are positional (`#a0`, `:a0`) rather than derived from the
   * attribute name. An expression attribute name only accepts `[A-Za-z0-9_]`,
   * so building `#${name}` breaks on any attribute carrying a dash or a dot —
   * and breaks at call time, on data, not in review.
   *
   * @param tableName - Table name
   * @param key - Full item key, already in wire form
   * @param attributes - Attributes to set, in wire form, **excluding the key**
   * @param signal - Optional abort signal to cancel the request
   * @throws Error when there is no attribute to set
   */
  async updateItemRaw(
    tableName: string,
    key: Record<string, unknown>,
    attributes: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<void> {
    const names = Object.keys(attributes);
    if (names.length === 0) {
      // An empty SET is not a no-op to DynamoDB, it is a syntax error. Saying
      // so beats sending it and reporting whatever the service answers.
      throw new Error(`No attribute to update on '${tableName}': the item carries nothing beyond its key`);
    }

    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, AttributeValue> = {};
    const assignments: string[] = [];

    names.forEach((name, position) => {
      const placeholder = `a${String(position)}`;
      expressionAttributeNames[`#${placeholder}`] = name;
      expressionAttributeValues[`:${placeholder}`] = attributes[name] as AttributeValue;
      assignments.push(`#${placeholder} = :${placeholder}`);
    });

    await this.client.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: key as Record<string, AttributeValue>,
        UpdateExpression: `SET ${assignments.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }),
      ...(signal !== undefined ? [{ abortSignal: signal }] : []),
    );
  }

  /**
   * Writes items already in DynamoDB **wire form**, in batches, and reports
   * what it could not write.
   *
   * Two things make this more than a loop over `PutItem`.
   *
   * DynamoDB answers a throttled or oversized `BatchWriteItem` with HTTP 200
   * and the rejected items in `UnprocessedItems`; nothing is thrown. A caller
   * that only guards against an exception therefore records a half-written
   * batch as a complete one, which on an anagrafica load is silent data loss.
   * Those items are re-sent with jittered exponential backoff, and whatever
   * survives that is **returned**, never swallowed.
   *
   * Every request is a `PutRequest`, so an item present in the table and absent
   * from `items` is left alone: this replaces items, it does not reconcile a
   * table against a list.
   *
   * @param tableName - Table name
   * @param items - Items to write, each already in wire form
   * @param options - Batch size, retry budget, progress handler and abort signal
   * @returns How many items were written, and which were not
   */
  async batchWriteItemRaw(
    tableName: string,
    items: ReadonlyArray<Record<string, unknown>>,
    options: DynamoDBBatchWriteOptions = {},
  ): Promise<DynamoDBBatchWriteResult> {
    const batchSize = Math.min(options.batchSize ?? BATCH_WRITE_MAX_ITEMS, BATCH_WRITE_MAX_ITEMS);
    const maxRetries = options.maxRetries ?? BATCH_WRITE_MAX_RETRIES;
    const sendOptions = options.signal !== undefined ? { abortSignal: options.signal } : undefined;

    // `BatchWriteItem` reports rejection in the response body, not by throwing,
    // so `GORetryRunner` — which retries thrown errors — is the wrong
    // primitive. The backoff strategy still comes from the polling module.
    const backoff = GOBackoff.exponentialJittered(BATCH_WRITE_RETRY_BASE_MS, BATCH_WRITE_RETRY_CAP_MS);
    const sleeper = new GODefaultSleeper();

    let written = 0;
    const unprocessed: Record<string, unknown>[] = [];

    for (let start = 0; start < items.length; start += batchSize) {
      let pending: ReadonlyArray<Record<string, unknown>> = items.slice(start, start + batchSize);
      let attempt = 0;
      let previousDelayMs: number | undefined;

      while (pending.length > 0) {
        const response: BatchWriteItemCommandOutput = await this.client.send(
          new BatchWriteItemCommand({
            RequestItems: {
              [tableName]: pending.map((item) => ({ PutRequest: { Item: item as Record<string, AttributeValue> } })),
            },
          }),
          sendOptions,
        );

        const rejected = rejectedItems(response, tableName);
        written += pending.length - rejected.length;

        if (rejected.length === 0) break;

        if (attempt >= maxRetries) {
          unprocessed.push(...rejected);
          break;
        }

        options.onRetry?.(rejected.length, attempt + 1);

        // Full jitter can return 0 ms, which would re-send the rejected part
        // immediately and deepen the throttling that caused it.
        const delayMs = Math.max(
          BATCH_WRITE_RETRY_BASE_MS,
          backoff({ attempt, ...(previousDelayMs !== undefined ? { previousDelayMs } : {}) }),
        );
        await sleeper.sleep(delayMs, options.signal);

        previousDelayMs = delayMs;
        pending = rejected;
        attempt += 1;
      }
    }

    return { written, unprocessed };
  }
}

/**
 * The items a `BatchWriteItem` response reports as not written.
 *
 * @param response - The command output
 * @param tableName - Table the batch targeted
 * @returns Rejected items, in wire form
 */
function rejectedItems(
  response: BatchWriteItemCommandOutput,
  tableName: string,
): ReadonlyArray<Record<string, unknown>> {
  const requests: ReadonlyArray<WriteRequest> = response.UnprocessedItems?.[tableName] ?? [];

  return requests
    .map((request) => request.PutRequest?.Item)
    .filter((item): item is Record<string, AttributeValue> => item !== undefined);
}
