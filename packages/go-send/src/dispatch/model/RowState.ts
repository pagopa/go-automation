import type { DocumentSourceKind } from './DocumentSourceKind.js';
import type { RowError } from './RowError.js';
import type { RowStatus } from './RowStatus.js';

/**
 * Compact in-memory state of a row (§6.2). Immutable: every transition
 * produces a new object (see `applyJournalEntry`).
 */
export interface RowState {
  readonly rowIndex: number;
  readonly rowKey: string;
  readonly status: RowStatus;
  readonly notificationRequestId?: string;
  readonly iun?: string;
  readonly paProtocolNumber?: string;
  readonly idempotenceToken?: string;
  readonly groupId?: string;
  readonly documentSource?: DocumentSourceKind;
  readonly documentKeys?: ReadonlyArray<string>;
  readonly documentSha256?: ReadonlyArray<string>;
  readonly sentAt?: string;
  readonly acceptedAt?: string;
  readonly sendAttempts: number;
  readonly verifyChecks: number;
  readonly requestId?: string;
  readonly requestIds?: Readonly<Record<string, string>>;
  readonly requestIdReason?: string;
  readonly requestIdFoundAt?: string;
  readonly requestIdChecks: number;
  readonly error?: RowError;
  readonly warnings: ReadonlyArray<string>;
}
