/**
 * Logger Handler Interface
 * Handles log events and outputs them to different destinations
 */

import { GOLogEvent } from './GOLogEvent.js';

export interface GOLoggerHandler {
  /**
   * Handle a log event
   * @param event - The log event to handle
   */
  handle(event: GOLogEvent): void;

  /**
   * Reset the handler state (e.g., indentation level)
   */
  reset(): Promise<void>;
}
