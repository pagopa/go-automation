import type { InputRow } from '../input/InputRow.js';
import { resolveRowKey } from '../ids/identifiers.js';
import { buildPreset } from './buildPreset.js';
import { buildDirectRecord } from './buildDirectRecord.js';
import { buildRecord } from './buildRecord.js';
import type { CreatedRecord } from './CreatedRecord.js';
import type { FieldValues } from './FieldValues.js';
import { applyFillTransforms, mapRow, mergeFieldValues } from './mapRow.js';
import type { PresetBuildResult } from './PresetBuildResult.js';
import type { RecordBuildResult } from './RecordBuildResult.js';
import type { RecordFactoryDirectOptions } from './RecordFactoryDirectOptions.js';
import type { RecordFactoryOptions } from './RecordFactoryOptions.js';
import type { ValidationIssue } from './ValidationIssue.js';

/**
 * Turns input rows into records: row key, column mapping, precedence and
 * validation. Deterministic, so the validation pass and the send pass
 * produce the same records.
 *
 * Precedence of the values (§7.4.2): row (after the profile's normalizing
 * transforms) > CLI > environment > profile fill transforms
 * (`constantIfPresent`, `default`) > neutral defaults of the code.
 */
export class RecordFactory {
  /**
   * @param options - Profile, value layers, run context and, in `direct` mode, the requestId template
   * @throws Error when the context mode is `direct` but `options.direct` is missing
   */
  constructor(private readonly options: RecordFactoryOptions) {
    if (options.context.mode === 'direct' && options.direct === undefined) {
      throw new Error('RecordFactory: direct mode requires the requestId options (options.direct)');
    }
  }

  /**
   * Builds the record of a row.
   *
   * @param row - Input row
   * @returns Row key and build result
   */
  public create(row: InputRow): CreatedRecord {
    const rowKey = this.rowKey(row);
    const values = applyFillTransforms(
      mergeFieldValues(
        mapRow(row.values, this.options.profile),
        this.options.cliValues,
        this.options.environmentValues,
      ),
      this.options.profile,
    );
    const direct = this.options.direct;
    const result =
      this.options.context.mode === 'direct' && direct !== undefined
        ? this.createDirect(row, rowKey, values, direct)
        : buildRecord(row.rowIndex, rowKey, values, this.options.context);
    return { rowIndex: row.rowIndex, rowKey, result };
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

  private createDirect(
    row: InputRow,
    rowKey: string,
    values: FieldValues,
    direct: RecordFactoryDirectOptions,
  ): RecordBuildResult {
    const requestId = direct.template.render(direct.runId, rowKey, row.rowIndex, row.values);
    const result = buildDirectRecord(row.rowIndex, rowKey, values, this.options.context, requestId);
    const emptyColumns = direct.template.emptyColumns(row.values);
    if (emptyColumns.length === 0) return result;
    const issues: ReadonlyArray<ValidationIssue> = emptyColumns.map((column) => ({
      code: 'MISSING_FIELD',
      message: `requestId template: column "${column}" is empty`,
    }));
    return { ok: false, issues: result.ok ? issues : [...result.issues, ...issues] };
  }

  private rowKey(row: InputRow): string {
    return resolveRowKey(row.values, this.options.rowKeyColumn ?? this.options.profile.rowKeyColumn, row.rowIndex);
  }
}
