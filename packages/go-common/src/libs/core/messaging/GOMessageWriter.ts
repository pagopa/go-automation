import type { GOEventEmitter } from '../events/GOEventEmitter.js';

import type { GOMessageWriterEventMap } from './GOMessageWriterEventMap.js';
import type { GOMessageReceipt } from './models/GOMessageReceipt.js';
import type { GOOutboundMessage } from './models/GOOutboundMessage.js';

/**
 * Interface for message writing (sending) transport
 * Implementations handle provider-specific message delivery and file uploads
 */
export interface GOMessageWriter extends GOEventEmitter<GOMessageWriterEventMap> {
  /** Name of the messaging provider (e.g. 'slack', 'teams') */
  readonly providerName: string;

  /**
   * Sends a message to the specified target
   * File attachments are handled internally by the writer implementation
   *
   * @param message - The outbound message to send
   * @returns Receipt with delivery status and provider-specific details
   */
  sendMessage(message: GOOutboundMessage): Promise<GOMessageReceipt>;

  /**
   * Tests the connection to the messaging provider
   *
   * @returns True if the connection is valid
   * @throws Error if the connection test fails
   */
  testConnection(): Promise<boolean>;
}
