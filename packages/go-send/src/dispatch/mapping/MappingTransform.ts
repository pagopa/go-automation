import type { CanonicalField } from './CanonicalField.js';
import type { MappingTransformOp } from './MappingTransformOp.js';
import type { MappingTransformValues } from './MappingTransformValues.js';

/**
 * One transform step of a mapping profile. Which parameters are required
 * depends on `op` and is checked by `parseMappingProfile`.
 */
export interface MappingTransform {
  readonly op: MappingTransformOp;
  /** `emptyIfIn`: list of values; `map`: dictionary. */
  readonly values?: MappingTransformValues;
  /** `constantIfPresent`: field whose presence triggers the transform. */
  readonly field?: CanonicalField;
  /** `constantIfPresent`, `default`: value to set. */
  readonly value?: string;
}
