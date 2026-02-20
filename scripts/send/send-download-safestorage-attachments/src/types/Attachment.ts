/**
 * Attachment metadata as found in the JSONL input
 */
export interface Attachment {
  /** Attachment date (ISO 8601) */
  readonly date: string;

  /** Attachment identifier within the event */
  readonly id: string;

  /** SHA-256 digest (base64) */
  readonly sha256: string;

  /** Document type description */
  readonly documentType: string;

  /** Safe Storage URI (safestorage://...) */
  readonly uri: string;
}
