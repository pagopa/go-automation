/** Datapoint of a CloudWatch metric, structurally equal to `MetricDatapoint` of `@pagopa/go-aws/cloudwatch-metrics`. */
export interface RunbookMetricDatapoint {
  readonly timestamp: Date;
  readonly value: number;
}
