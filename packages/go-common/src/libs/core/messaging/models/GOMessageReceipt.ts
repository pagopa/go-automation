/**
 * Represents the result of sending a message
 */
export interface GOMessageReceipt {
  /** Whether the message was sent successfully */
  readonly success: boolean;
  /** Provider-specific message ID (if available) */
  readonly messageId?: string;
  /** Timestamp of the sent message */
  readonly timestamp?: Date;
  /** Error description (if unsuccessful) */
  readonly error?: string;
  /** Raw provider response for debugging */
  readonly providerResponse?: unknown;
}
