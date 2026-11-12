import type { JournalUpload } from './JournalUpload.js';

/**
 * Upload recorded in the journal, with the time it was recorded.
 */
export interface RecordedUpload extends JournalUpload {
  /** ISO 8601 timestamp of the `DOCUMENT_UPLOADED` entry. */
  readonly ts: string;
}
