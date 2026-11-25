/** The query that reads a batch of items. */
export type QueryOfBatchFn<TItem> = (batch: ReadonlyArray<TItem>) => string;
