/**
 * An operation retried by the upload stage.
 */
export type RetriedOperationFn<T> = () => Promise<T>;
