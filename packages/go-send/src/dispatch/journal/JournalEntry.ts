import type { RowError } from '../model/RowError.js';
import type { JournalDocuments } from './JournalDocuments.js';
import type { JournalEvent } from './JournalEvent.js';
import type { JournalUpload } from './JournalUpload.js';

/**
 * One line of `journal.jsonl` (§11.2). Never contains the original row,
 * personal data beyond identifiers, or secrets.
 */
export interface JournalEntry {
  /** ISO 8601 timestamp. */
  readonly ts: string;
  readonly event: JournalEvent;
  readonly rowIndex?: number;
  readonly rowKey?: string;
  readonly notificationRequestId?: string;
  readonly iun?: string;
  readonly paProtocolNumber?: string;
  readonly idempotenceToken?: string;
  readonly groupId?: string;
  readonly attempt?: number;
  readonly documents?: JournalDocuments;
  readonly upload?: JournalUpload;
  readonly error?: RowError;
  readonly warning?: string;
}
