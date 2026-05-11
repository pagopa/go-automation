/**
 * Lifecycle status of an attachment row in the local index.
 */
export const AttachmentSyncStatus = {
  INDEXED: 'indexed',
  SKIPPED: 'skipped',
  FAILED: 'failed',
  DELETED: 'deleted',
} as const;

export type AttachmentSyncStatusValue = (typeof AttachmentSyncStatus)[keyof typeof AttachmentSyncStatus];

/**
 * Reasons attached to a `skipped` status.
 */
export const AttachmentSkipReason = {
  ALREADY_INDEXED: 'already_indexed',
  UNSUPPORTED_MIME: 'unsupported_mime',
  TOO_LARGE: 'too_large',
  FORBIDDEN: 'forbidden',
} as const;

export type AttachmentSkipReasonValue = (typeof AttachmentSkipReason)[keyof typeof AttachmentSkipReason];
