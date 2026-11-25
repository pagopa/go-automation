/**
 * Transform `emptyIfIn`: clears the row value when it is one of `values`
 * (case-insensitive), e.g. `ITALIA` for a domestic address.
 */
export interface MappingEmptyIfInTransform {
  readonly op: 'emptyIfIn';
  readonly values: ReadonlyArray<string>;
}
