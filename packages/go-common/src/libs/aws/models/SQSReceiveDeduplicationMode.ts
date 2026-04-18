/**
 * Supported deduplication modes for SQS message reception
 */
export enum SQSReceiveDeduplicationMode {
  /** Filter technical duplicates (same SQS message ID) */
  MESSAGE_ID = 'message-id',

  /** Filter content duplicates (same MD5 hash of Body + MessageAttributes) */
  CONTENT_MD5 = 'content-md5',

  /** No deduplication, receive everything as delivered by SQS */
  NONE = 'none',
}
