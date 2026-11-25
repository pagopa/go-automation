import type { SQSMoveErrorHandler, SQSMoveProgressHandler, SQSReceiveEmptyReceiveHandler } from './SQSHandlers.js';

/**
 * Optional callbacks for `AWSSQSService.moveMessages`.
 */
export interface SQSMoveCallbacks {
  /** Called after each batch is processed (success and failure counters) */
  readonly onProgress?: SQSMoveProgressHandler;

  /** Called when a Receive call returns no messages */
  readonly onEmptyReceive?: SQSReceiveEmptyReceiveHandler;

  /** Called for each per-message failure (validation, send, delete, unknown) */
  readonly onError?: SQSMoveErrorHandler;
}
