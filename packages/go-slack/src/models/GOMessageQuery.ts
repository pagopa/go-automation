import type { GOMessageTarget } from './GOMessageTarget.js';

/**
 * Query parameters for reading messages from a conversation
 */
export interface GOMessageQuery {
  /** Target conversation to read from */
  readonly target: GOMessageTarget;
  /** Cursor or timestamp for the oldest message to include */
  readonly oldest?: string;
  /** Cursor or timestamp for the newest message to include */
  readonly newest?: string;
  /** Maximum total number of messages to return */
  readonly limit?: number;
  /** Number of messages per page (default: 100) */
  readonly pageSize?: number;
  /** Whether to include thread replies in results */
  readonly includeThreadReplies?: boolean;
}
