import type { CanonicalField } from './CanonicalField.js';
import type { MappingFormat } from './MappingFormat.js';
import type { MappingOutputColumns } from './MappingOutputColumns.js';
import type { MappingTransforms } from './MappingTransforms.js';

/**
 * Declarative mapping from input columns to canonical fields (§7.3).
 */
export interface MappingProfile {
  readonly name: string;
  readonly format?: MappingFormat;
  /**
   * Input column → canonical field. Several columns may map to the same
   * field: the first non-empty one, in this order, wins.
   */
  readonly columns: Readonly<Record<string, CanonicalField>>;
  /** Transforms per field, applied in order after column mapping. */
  readonly transforms?: MappingTransforms;
  /** Column with a stable, unique row key (default: `r<rowIndex>`). */
  readonly rowKeyColumn?: string;
  readonly outputColumns?: MappingOutputColumns;
}
