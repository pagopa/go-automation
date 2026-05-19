/**
 * Dimension for CloudWatch metric queries.
 */
export interface MetricDimension {
  readonly name: string;
  readonly value: string;
}
