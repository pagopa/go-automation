import type { DispatchError } from '../DispatchError.js';

/**
 * Called when a send fails with a run-level error: the run must stop.
 */
export type GlobalErrorHandler = (error: DispatchError) => void;
