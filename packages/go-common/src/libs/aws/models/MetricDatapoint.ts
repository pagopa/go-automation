/**
 * A single CloudWatch metric datapoint.
 */
export interface MetricDatapoint {
  readonly timestamp: Date;
  readonly value: number;
}
