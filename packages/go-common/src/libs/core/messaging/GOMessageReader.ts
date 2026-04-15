import type { GOEventEmitter } from '../events/GOEventEmitter.js';

import type { GOMessageReaderEventMap } from './GOMessageReaderEventMap.js';
import type { GOMessagePage } from './models/GOMessagePage.js';
import type { GOMessageQuery } from './models/GOMessageQuery.js';
import type { GOMessageTarget } from './models/GOMessageTarget.js';
import type { GOReceivedMessage } from './models/GOReceivedMessage.js';

/**
 * Interface for message reading transport
 * Implementations handle provider-specific message fetching and streaming
 */
export interface GOMessageReader extends GOEventEmitter<GOMessageReaderEventMap> {
  /** Name of the messaging provider (e.g. 'slack', 'teams') */
  readonly providerName: string;

  /**
   * Fetches a single page of messages from a conversation
   *
   * @param query - Query parameters including target, pagination, and filters
   * @returns A page of messages with cursor for pagination
   */
  fetchMessages(query: GOMessageQuery): Promise<GOMessagePage>;

  /**
   * Fetches a single message by its ID
   *
   * @param messageId - Provider-specific message identifier
   * @param target - Target conversation containing the message
   * @returns The message if found, null otherwise
   */
  getMessage(messageId: string, target: GOMessageTarget): Promise<GOReceivedMessage | null>;

  /**
   * Streams messages as an async generator, yielding pages with automatic pagination
   * Respects the query limit for total messages across all pages
   *
   * @param query - Query parameters including target, pagination, and filters
   * @yields Pages of messages until exhausted or limit reached
   */
  fetchMessageStream(query: GOMessageQuery): AsyncGenerator<GOMessagePage, void, unknown>;
}
