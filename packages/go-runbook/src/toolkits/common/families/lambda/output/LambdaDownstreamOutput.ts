import type { LogLine } from '../../../parsing/aws/cloudwatch-logs/LogLine.js';

/** Downstream microservice block of the Lambda output context. */
export interface LambdaDownstreamOutput {
  readonly target: string;
  readonly logGroup?: string;
  readonly logCount?: number;
  readonly errorMessage?: string;
  readonly recentLogs: ReadonlyArray<LogLine>;
}
