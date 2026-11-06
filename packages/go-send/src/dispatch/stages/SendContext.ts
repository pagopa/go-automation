import type { SENDNotificationRequest } from '../../services/notification/models/SENDNotificationRequest.js';
import type { RowIdentifiers } from '../ids/RowIdentifiers.js';
import type { DispatchRecord } from '../model/DispatchRecord.js';
import type { DocumentRef } from '../model/DocumentRef.js';

/**
 * Mutable per-row state of `SendStage` while a row is being sent. Lives only
 * for the duration of `send()`.
 */
export interface SendContext {
  readonly record: DispatchRecord;
  readonly ids: RowIdentifiers;
  request?: SENDNotificationRequest;
  documents?: ReadonlyArray<DocumentRef>;
  /** POST attempts, previous sessions included. */
  attempts: number;
  /** New POSTs after a `404` lookup. */
  reconcilePosts: number;
}
