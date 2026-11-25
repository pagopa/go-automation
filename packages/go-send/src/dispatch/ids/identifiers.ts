import { createHash, randomBytes } from 'node:crypto';

import type { RowIdentifiers } from './RowIdentifiers.js';

/** Printable ASCII, as accepted by `idempotenceToken` (A9). */
const PRINTABLE_ASCII = /^[ -~]*$/;

/** IUN format, e.g. `PAYK-MWDR-ZUAZ-202601-K-1`. */
const IUN_PATTERN = /^[A-Z]{4}-[A-Z]{4}-[A-Z]{4}-\d{6}-[A-Z]-\d$/;

/** Maximum length of `paProtocolNumber` and `idempotenceToken` (A9). */
export const MAX_IDENTIFIER_LENGTH = 256;

/**
 * Creates a run id: `<yyyyMMdd-HHmmss>-<4 random characters>` (UTC).
 *
 * @param now - Start of the run
 * @returns The run id
 */
export function createRunId(now: Date): string {
  const iso = now.toISOString(); // 2026-11-02T10:00:01.123Z
  const stamp = `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}`;
  return `${stamp}-${randomBytes(2).toString('hex')}`;
}

/**
 * Resolves the row key: the value of the key column when present, otherwise
 * `r<rowIndex>`.
 *
 * @param raw - Raw input row
 * @param rowKeyColumn - Key column, if configured
 * @param rowIndex - Position in the input, 0-based
 * @returns The row key
 */
export function resolveRowKey(
  raw: Readonly<Record<string, string>>,
  rowKeyColumn: string | undefined,
  rowIndex: number,
): string {
  const value = rowKeyColumn === undefined ? undefined : raw[rowKeyColumn]?.trim();
  return value !== undefined && value !== '' ? value : `r${rowIndex}`;
}

/**
 * Derives the idempotency keys of a row (§6.3). Deterministic: the same run
 * and row always produce the same keys, which is what makes retries and
 * resume safe.
 *
 * @param runId - Run id
 * @param rowKey - Row key
 * @param paProtocolNumber - Protocol number from the input, if any
 * @returns Protocol number and idempotence token
 */
export function deriveRowIdentifiers(runId: string, rowKey: string, paProtocolNumber?: string): RowIdentifiers {
  const tokenKey = PRINTABLE_ASCII.test(rowKey)
    ? rowKey
    : createHash('sha256').update(rowKey, 'utf8').digest('hex').slice(0, 16);
  return {
    paProtocolNumber: paProtocolNumber ?? `GO-${runId}-${rowKey}`,
    idempotenceToken: `${runId}-${tokenKey}`,
  };
}

/**
 * Whether a value has the IUN format (e.g. `PAYK-MWDR-ZUAZ-202601-K-1`).
 *
 * @param value - Candidate IUN
 * @returns Whether `value` is an IUN
 */
export function isIun(value: string): boolean {
  return IUN_PATTERN.test(value);
}

/**
 * Decodes the IUN from a `notificationRequestId` (Base64 of the IUN, A1).
 *
 * @param notificationRequestId - Value returned by `POST requests`
 * @returns The IUN, or `undefined` when the decoded value is not an IUN
 */
export function decodeIun(notificationRequestId: string): string | undefined {
  const decoded = Buffer.from(notificationRequestId, 'base64').toString('utf8');
  return isIun(decoded) ? decoded : undefined;
}

/**
 * Encodes an IUN as its `notificationRequestId` (Base64 of the IUN, A1):
 * the inverse of {@link decodeIun}.
 *
 * @param iun - A valid IUN
 * @returns The notification request id
 */
export function encodeNotificationRequestId(iun: string): string {
  return Buffer.from(iun, 'utf8').toString('base64');
}
