/** Notified before a batch is retried, with how many items are still unwritten. */
export type DynamoDBBatchWriteRetryHandler = (remaining: number, attempt: number) => void;

/** Tuning for a batched write, all of it optional. */
export interface DynamoDBBatchWriteOptions {
  /** Items per request; DynamoDB caps a `BatchWriteItem` at 25. */
  readonly batchSize?: number;

  /** How many times a batch carrying unprocessed items is re-sent. */
  readonly maxRetries?: number;

  /** Called before each retry, so a caller can report throttling as it happens. */
  readonly onRetry?: DynamoDBBatchWriteRetryHandler;

  /** Optional abort signal cancelling the whole write. */
  readonly signal?: AbortSignal;
}

/**
 * What a batched write actually managed to do.
 *
 * `unprocessed` is the point of this type. DynamoDB answers a throttled or
 * oversized `BatchWriteItem` with HTTP 200 and the rejected items listed in
 * `UnprocessedItems`, so a caller that only checks for a thrown error records
 * a half-written batch as a complete one.
 */
export interface DynamoDBBatchWriteResult {
  /** Items the table accepted. */
  readonly written: number;

  /** Items still rejected after the last retry, in the order they were given. */
  readonly unprocessed: ReadonlyArray<Record<string, unknown>>;
}
