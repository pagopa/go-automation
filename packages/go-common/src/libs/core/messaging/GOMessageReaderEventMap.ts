import type { GOReceivedMessage } from './models/GOReceivedMessage.js';

/**
 * Event map for GOMessageReader implementations
 * Emitted during message fetching and streaming lifecycle
 */
export interface GOMessageReaderEventMap {
  /** Emitted after a page of messages is fetched */
  'reader:page:fetched': {
    readonly conversationId: string;
    readonly messageCount: number;
    readonly cursor?: string;
    readonly duration: number;
  };

  /** Emitted for each individual message received during streaming */
  'reader:message:received': {
    readonly message: GOReceivedMessage;
    readonly index: number;
  };

  /** Emitted when a streaming read operation completes */
  'reader:completed': {
    readonly conversationId: string;
    readonly totalMessages: number;
    readonly totalPages: number;
    readonly duration: number;
  };

  /** Emitted when a read operation fails */
  'reader:error': {
    readonly error: Error;
    readonly conversationId: string;
  };
}
