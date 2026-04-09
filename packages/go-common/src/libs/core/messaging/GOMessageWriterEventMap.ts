/**
 * Event map for GOMessageWriter implementations
 * Emitted during message sending and file upload lifecycle
 */
export interface GOMessageWriterEventMap {
  /** Emitted after a message is successfully sent */
  'writer:message:sent': {
    readonly messageId?: string;
    readonly conversationId: string;
    readonly duration: number;
  };

  /** Emitted when a message send fails */
  'writer:message:error': {
    readonly error: Error;
    readonly conversationId: string;
  };

  /** Emitted after a file is successfully uploaded */
  'writer:file:uploaded': {
    readonly fileName: string;
    readonly conversationId: string;
    readonly duration: number;
  };

  /** Emitted after a connection test completes */
  'writer:connection:tested': {
    readonly success: boolean;
    readonly duration: number;
  };
}
