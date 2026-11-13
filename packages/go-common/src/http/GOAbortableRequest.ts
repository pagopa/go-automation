/**
 * Abortable request result
 */
export type GOAbortHandler = () => void;

export interface GOAbortableRequest<T> {
  /** The promise that resolves with the response */
  promise: Promise<T>;
  /** Function to abort the request */
  abort: GOAbortHandler;
  /** The underlying AbortController */
  controller: AbortController;
}
