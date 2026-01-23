/**
 * Abortable request result
 */
export interface GOAbortableRequest<T> {
    /** The promise that resolves with the response */
    promise: Promise<T>;
    /** Function to abort the request */
    abort: () => void;
    /** The underlying AbortController */
    controller: AbortController;
}
