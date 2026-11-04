import type { RowState } from '../model/RowState.js';
import type { RowStatus } from '../model/RowStatus.js';
import type { JournalEntry } from './JournalEntry.js';
import type { JournalEvent } from './JournalEvent.js';

/** Status reached by each row event. */
const STATUS_BY_EVENT: ReadonlyMap<JournalEvent, RowStatus> = new Map<JournalEvent, RowStatus>([
  ['ROW_INVALID', 'INVALID'],
  ['ROW_REVALIDATED', 'PENDING'],
  ['SENDING', 'SENDING'],
  ['SENT', 'SENT'],
  ['SEND_FAILED', 'SEND_FAILED'],
  ['RECONCILING', 'RECONCILING'],
  ['SEND_UNCERTAIN', 'SEND_UNCERTAIN'],
  ['ACCEPTED', 'ACCEPTED'],
  ['REFUSED', 'REFUSED'],
  ['VERIFY_TIMEOUT', 'VERIFY_TIMEOUT'],
  ['PRESET', 'SENT'],
  ['REQUEST_ID_FOUND', 'REQUEST_ID_FOUND'],
  ['REQUEST_ID_NOT_FOUND', 'REQUEST_ID_NOT_FOUND'],
]);

/**
 * Pure reducer of the journal: applies one entry to the state of its row.
 *
 * Used both live (every transition) and on resume (replay), so the two can
 * never diverge.
 *
 * @param state - Current state of the row, or `undefined` for a new row
 * @param entry - Journal entry; must carry `rowIndex` and `rowKey`
 * @returns The new state, or `state` unchanged for run-level entries
 */
export function applyJournalEntry(state: RowState | undefined, entry: JournalEntry): RowState | undefined {
  if (entry.rowIndex === undefined || entry.rowKey === undefined) return state;

  const base: RowState = state ?? {
    rowIndex: entry.rowIndex,
    rowKey: entry.rowKey,
    status: 'PENDING',
    sendAttempts: 0,
    verifyChecks: 0,
    requestIdChecks: 0,
    warnings: [],
  };

  if (entry.event === 'WARNING') {
    const warning = entry.warning;
    if (warning === undefined || base.warnings.includes(warning)) return base;
    return { ...base, warnings: [...base.warnings, warning] };
  }

  const status = STATUS_BY_EVENT.get(entry.event);
  if (status === undefined) return base;

  const next: RowState = { ...withIdentifiers(base, entry), status };
  switch (entry.event) {
    case 'SENDING':
      return { ...withoutError(next), sendAttempts: entry.attempt ?? base.sendAttempts + 1 };
    case 'SENT':
      return { ...withoutError(next), sentAt: base.sentAt ?? entry.ts };
    case 'ACCEPTED':
      return { ...withoutError(next), acceptedAt: entry.ts, verifyChecks: entry.attempt ?? base.verifyChecks };
    case 'REFUSED':
    case 'VERIFY_TIMEOUT':
      return withError({ ...next, verifyChecks: entry.attempt ?? base.verifyChecks }, entry);
    case 'ROW_REVALIDATED':
      return withoutError(next);
    case 'RECONCILING':
    case 'PRESET':
      return next;
    case 'REQUEST_ID_FOUND':
      return {
        ...next,
        ...(entry.requestIds !== undefined && { requestIds: entry.requestIds }),
        requestIdReason: entry.requestIdReason ?? 'FOUND',
        requestIdFoundAt: entry.ts,
        requestIdChecks: entry.attempt ?? base.requestIdChecks,
      };
    case 'REQUEST_ID_NOT_FOUND':
      return {
        ...next,
        ...(entry.requestIdReason !== undefined && { requestIdReason: entry.requestIdReason }),
        requestIdChecks: entry.attempt ?? base.requestIdChecks,
      };
    default:
      return withError(next, entry);
  }
}

function withIdentifiers(state: RowState, entry: JournalEntry): RowState {
  return {
    ...state,
    ...(entry.notificationRequestId !== undefined && { notificationRequestId: entry.notificationRequestId }),
    ...(entry.iun !== undefined && { iun: entry.iun }),
    ...(entry.paProtocolNumber !== undefined && { paProtocolNumber: entry.paProtocolNumber }),
    ...(entry.idempotenceToken !== undefined && { idempotenceToken: entry.idempotenceToken }),
    ...(entry.groupId !== undefined && { groupId: entry.groupId }),
    // SENDING carries the requestId of an attempt that may still fail: only the
    // outcome (SENT, REQUEST_ID_FOUND) makes it the requestId of the row.
    ...(entry.requestId !== undefined && entry.event !== 'SENDING' && { requestId: entry.requestId }),
    ...(entry.documents !== undefined && {
      documentSource: entry.documents.source,
      documentKeys: entry.documents.keys,
      documentSha256: entry.documents.sha256,
    }),
  };
}

function withError(state: RowState, entry: JournalEntry): RowState {
  return entry.error === undefined ? state : { ...state, error: entry.error };
}

function withoutError(state: RowState): RowState {
  if (state.error === undefined) return state;
  const { error: _removed, ...rest } = state;
  return rest;
}
