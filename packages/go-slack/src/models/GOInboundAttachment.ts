/**
 * Represents a file attachment received from a messaging provider
 */
export interface GOInboundAttachment {
  /** Provider-specific attachment ID */
  readonly id: string;
  /** Filename of the attachment */
  readonly name: string;
  /** URL to download the attachment */
  readonly url: string;
  /** MIME type of the file */
  readonly mimeType?: string;
  /** File size in bytes */
  readonly size?: number;
}
