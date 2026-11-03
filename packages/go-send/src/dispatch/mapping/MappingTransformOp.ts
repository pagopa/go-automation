/**
 * Closed set of pure transforms a mapping profile can apply (§7.3).
 *
 * - `trim`, `upper`: string normalization;
 * - `emptyIfIn`: clears the value when it is one of `values` (case-insensitive);
 * - `map`: replaces the value through the `values` dictionary;
 * - `constantIfPresent`: sets `value` when `field` has a value;
 * - `default`: sets `value` when the field is empty.
 */
export type MappingTransformOp = 'trim' | 'upper' | 'emptyIfIn' | 'map' | 'constantIfPresent' | 'default';
