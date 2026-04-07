/**
 * Represents a file attachment to be sent with a message
 */
export interface GOOutboundAttachment {
  /** Absolute path to the file on disk */
  readonly filePath: string;
  /** Custom filename (defaults to basename of filePath) */
  readonly fileName?: string;
  /** Display title for the attachment */
  readonly title?: string;
  /** MIME type of the file */
  readonly mimeType?: string;
}
