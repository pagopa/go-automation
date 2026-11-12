/**
 * Attachment of a paper delivery request to pn-external-channels.
 */
export interface PaperEngagementAttachment {
  readonly uri: string;
  readonly order: number;
  readonly documentType: 'AAR' | 'ATTO';
  readonly sha256: string;
}
