import type { CanonicalField } from './CanonicalField.js';

/**
 * Values of the canonical fields of one row, trimmed and non-empty.
 */
export type FieldValues = ReadonlyMap<CanonicalField, string>;
