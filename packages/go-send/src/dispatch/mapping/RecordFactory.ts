import type { InputRow } from '../input/InputRow.js';
import { resolveRowKey } from '../ids/identifiers.js';
import { buildPreset } from './buildPreset.js';
import { buildRecord } from './buildRecord.js';
import type { CreatedRecord } from './CreatedRecord.js';
import { mapRow, mergeFieldValues } from './mapRow.js';
import type { PresetBuildResult } from './PresetBuildResult.js';
import type { RecordFactoryOptions } from './RecordFactoryOptions.js';

/**
 * Turns input rows into records: row key, column mapping, precedence
 * (row > CLI > environment > neutral defaults) and validation. Deterministic,
 * so the validation pass and the send pass produce the same records.
 */
export class RecordFactory {
  constructor(private readonly options: RecordFactoryOptions) {}

  /**
   * Builds the record of a row.
   *
   * @param row - Input row
   * @returns Row key and build result
   */
  public create(row: InputRow): CreatedRecord {
    const rowKey = this.rowKey(row);
    const values = mergeFieldValues(
      mapRow(row.values, this.options.profile),
      this.options.cliValues,
      this.options.environmentValues,
    );
    return { rowIndex: row.rowIndex, rowKey, result: buildRecord(row.rowIndex, rowKey, values, this.options.context) };
  }

  /**
   * Reads the identifiers of a row already sent (phases without `send`).
   *
   * @param row - Input row
   * @returns Identifiers, or the issues
   */
  public createPreset(row: InputRow): PresetBuildResult {
    const rowKey = this.rowKey(row);
    return buildPreset(row.rowIndex, rowKey, mapRow(row.values, this.options.profile));
  }

  private rowKey(row: InputRow): string {
    return resolveRowKey(row.values, this.options.rowKeyColumn ?? this.options.profile.rowKeyColumn, row.rowIndex);
  }
}
