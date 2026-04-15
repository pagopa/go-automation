/**
 * Represents a message destination (channel, DM, group)
 * Provider-agnostic target for sending and receiving messages
 */
export interface GOMessageTarget {
  /** Channel ID, DM ID, or conversation identifier */
  readonly conversationId: string;
  /** Type of conversation */
  readonly kind?: 'channel' | 'direct' | 'group';
  /** Thread or reply identifier */
  readonly threadId?: string;
}
