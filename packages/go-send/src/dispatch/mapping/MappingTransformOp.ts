/**
 * Closed set of pure transforms a mapping profile can apply (§7.3); the `op`
 * of each member of `MappingTransform`.
 *
 * - normalizing, on the row value: `trim`, `upper`, `emptyIfIn`, `map`;
 * - filling, after the merge with CLI and environment: `constantIfPresent`, `default`.
 */
export type MappingTransformOp = 'trim' | 'upper' | 'emptyIfIn' | 'map' | 'constantIfPresent' | 'default';
