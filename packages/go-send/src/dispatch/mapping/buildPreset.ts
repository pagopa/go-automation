import { decodeIun } from '../ids/identifiers.js';
import type { FieldValues } from './FieldValues.js';
import type { PresetBuildResult } from './PresetBuildResult.js';

const NOTIFICATION_REQUEST_ID = /^[A-Za-z0-9+/=]{36}$/;

/**
 * Reads the identifiers of a row already sent (`preset.iun` and/or
 * `preset.notificationRequestId`, RF-12). Pure. The missing one is derived:
 * the `notificationRequestId` is the Base64 of the IUN (A1).
 *
 * @param rowIndex - Position in the input
 * @param rowKey - Row key
 * @param values - Mapped field values of the row
 * @returns The identifiers, or why the row cannot be processed
 */
export function buildPreset(rowIndex: number, rowKey: string, values: FieldValues): PresetBuildResult {
  const iun = values.get('preset.iun');
  const requestId = values.get('preset.notificationRequestId');
  if (iun === undefined && requestId === undefined) {
    return {
      ok: false,
      issues: [
        {
          code: 'MISSING_FIELD',
          field: 'preset.iun',
          message: 'preset.iun or preset.notificationRequestId is required',
        },
      ],
    };
  }
  if (requestId !== undefined && !NOTIFICATION_REQUEST_ID.test(requestId)) {
    return {
      ok: false,
      issues: [
        {
          code: 'INVALID_FORMAT',
          field: 'preset.notificationRequestId',
          message: `"${requestId}" is not a notificationRequestId`,
        },
      ],
    };
  }
  const resolvedIun = iun ?? (requestId === undefined ? undefined : decodeIun(requestId));
  if (resolvedIun === undefined || decodeIun(Buffer.from(resolvedIun, 'utf8').toString('base64')) === undefined) {
    return {
      ok: false,
      issues: [{ code: 'INVALID_FORMAT', field: 'preset.iun', message: `"${iun ?? requestId ?? ''}" is not an IUN` }],
    };
  }
  return {
    ok: true,
    preset: {
      rowIndex,
      rowKey,
      iun: resolvedIun,
      notificationRequestId: requestId ?? Buffer.from(resolvedIun, 'utf8').toString('base64'),
    },
  };
}
