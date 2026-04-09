import type { GOInboundAttachment } from './GOInboundAttachment.js';
import type { GOMessageAuthor } from './GOMessageAuthor.js';
import type { GOMessageTarget } from './GOMessageTarget.js';

/**
 * Represents a message received from a messaging provider
 */
export interface GOReceivedMessage {
  /** Provider-specific message ID (e.g. Slack timestamp) */
  readonly id: string;
  /** Conversation the message belongs to */
  readonly target: GOMessageTarget;
  /** Message body text */
  readonly text: string;
  /** Author of the message */
  readonly author?: GOMessageAuthor;
  /** When the message was sent */
  readonly sentAt: Date;
  /** File attachments included in the message */
  readonly attachments?: ReadonlyArray<GOInboundAttachment>;
  /** Raw provider response for advanced use cases */
  readonly raw?: unknown;
}
