/**
 * Supported deduplication modes
 */
export enum SendDumpSqsDedupMode {
  /** Filter technical duplicates (same SQS message ID) */
  MESSAGE_ID = 'message-id',

  /** Filter content duplicates (same MD5 hash of Body + MessageAttributes) */
  CONTENT_MD5 = 'content-md5',

  /** No deduplication, dump everything as received */
  NONE = 'none',
}
