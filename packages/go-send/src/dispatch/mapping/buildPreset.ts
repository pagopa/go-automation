import { FieldReader } from './FieldReader.js';
import type { FieldValues } from './FieldValues.js';
import type { PresetBuildResult } from './PresetBuildResult.js';
import { readPresetIds } from './recordReaders.js';

/**
 * Reads the identifiers of a row already sent (`preset.iun` and/or
 * `preset.notificationRequestId`, RF-12). Pure. The missing one is derived
 * (the `notificationRequestId` is the Base64 of the IUN, A1); when both are
 * present they must agree, otherwise the row is invalid.
 *
 * @param rowIndex - Position in the input
 * @param rowKey - Row key
 * @param values - Mapped field values of the row
 * @returns The identifiers, or why the row cannot be processed
 */
export function buildPreset(rowIndex: number, rowKey: string, values: FieldValues): PresetBuildResult {
  const reader = new FieldReader(values);
  const ids = readPresetIds(reader, true);
  if (ids === undefined || reader.hasIssues()) return reader.failure();
  return { ok: true, preset: { rowIndex, rowKey, iun: ids.iun, notificationRequestId: ids.notificationRequestId } };
}
