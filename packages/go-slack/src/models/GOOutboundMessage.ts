import type { GOMessageTarget } from './GOMessageTarget.js';
import type { GOOutboundAttachment } from './GOOutboundAttachment.js';

/**
 * Represents a message to be sent via a messaging provider
 */
export interface GOOutboundMessage {
  /** Destination for the message */
  readonly target: GOMessageTarget;
  /** Message body text */
  readonly text: string;
  /** Text format hint for the provider */
  readonly format?: 'plain' | 'markdown';
  /** File attachments to include */
  readonly attachments?: ReadonlyArray<GOOutboundAttachment>;
  /** Provider-specific metadata */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
