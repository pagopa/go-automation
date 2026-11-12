import type { InputFormat } from '../input/InputFormat.js';
import type { MappingOutputColumns } from '../mapping/MappingOutputColumns.js';

/**
 * Output settings of a session (§12).
 */
export interface DispatchSessionOutput {
  readonly format: InputFormat;
  readonly delimiter?: string;
  readonly outputPath: string;
  readonly reportPath: string;
  readonly outputColumns?: MappingOutputColumns;
  readonly includeStatus: boolean;
  readonly onlySuccess: boolean;
}
