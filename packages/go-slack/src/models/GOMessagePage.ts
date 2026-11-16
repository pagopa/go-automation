import type { GOMessageTarget } from './GOMessageTarget.js';
import type { GOReceivedMessage } from './GOReceivedMessage.js';

/**
 * Represents a paginated result of messages from a conversation
 */
export interface GOMessagePage {
  /** Messages in this page */
  readonly messages: ReadonlyArray<GOReceivedMessage>;
  /** Cursor for fetching the next page (if available) */
  readonly nextCursor?: string;
  /** Whether more messages are available beyond this page */
  readonly hasMore: boolean;
  /** Target conversation this page belongs to */
  readonly target: GOMessageTarget;
}
