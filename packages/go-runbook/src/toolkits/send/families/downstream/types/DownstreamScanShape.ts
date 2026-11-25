/** Row limit and projection of a downstream scan, as forwarded to the query builder. */
export interface DownstreamScanShape {
  readonly resultLimit?: number;
  readonly projection?: ReadonlyArray<string>;
}
