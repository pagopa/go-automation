import type { CanonicalField } from './CanonicalField.js';

/**
 * Fill transform `constantIfPresent`: sets `value` when the field is still
 * empty after merging row, CLI and environment values, and `field` has a
 * value (e.g. `digitalDomicile.type = PEC` when there is a digital address).
 */
export interface MappingConstantIfPresentTransform {
  readonly op: 'constantIfPresent';
  /** Field whose presence triggers the transform. */
  readonly field: CanonicalField;
  readonly value: string;
}
