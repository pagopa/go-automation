/**
 * Action to take after a message is processed by the message handler.
 */
export enum SQSProcessAction {
  /** Delete the message from the queue (success) */
  DELETE = 'DELETE',

  /** Release the message immediately (VisibilityTimeout = 0) */
  RELEASE = 'RELEASE',

  /** Skip action (keep current visibility) */
  SKIP = 'SKIP',
}
