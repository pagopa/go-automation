/**
 * Transform `map`: replaces the row value through a dictionary (exact,
 * case-sensitive match); values not in the dictionary are kept.
 */
export interface MappingMapTransform {
  readonly op: 'map';
  readonly values: Readonly<Record<string, string>>;
}
