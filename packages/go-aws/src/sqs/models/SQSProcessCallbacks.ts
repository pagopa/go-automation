import type { SQSProcessProgressHandler, SQSReceiveEmptyReceiveHandler } from './SQSHandlers.js';

/**
 * Optional callbacks for `AWSSQSService.processMessages`.
 */
export interface SQSProcessCallbacks {
  /** Called after each non-empty batch is processed */
  readonly onProgress?: SQSProcessProgressHandler;

  /** Called when a Receive call returns no messages */
  readonly onEmptyReceive?: SQSReceiveEmptyReceiveHandler;
}
