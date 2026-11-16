import type { SQSReceiveEmptyReceiveHandler, SQSReceiveProgressHandler } from './SQSHandlers.js';

/**
 * Optional callbacks for `AWSSQSService.receiveMessages`.
 */
export interface SQSReceiveCallbacks {
  /** Called after each non-empty Receive batch is processed */
  readonly onProgress?: SQSReceiveProgressHandler;

  /** Called when a Receive call returns no messages */
  readonly onEmptyReceive?: SQSReceiveEmptyReceiveHandler;
}
