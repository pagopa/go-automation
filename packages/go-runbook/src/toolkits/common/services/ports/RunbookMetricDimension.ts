/** Dimension of a CloudWatch metric, structurally equal to `MetricDimension` of `@pagopa/go-aws/cloudwatch-metrics`. */
export interface RunbookMetricDimension {
  readonly name: string;
  readonly value: string;
}
