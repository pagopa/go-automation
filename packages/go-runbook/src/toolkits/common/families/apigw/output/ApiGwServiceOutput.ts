import type { LogLine } from '../../../parsing/aws/cloudwatch-logs/LogLine.js';

export interface ApiGwServiceOutput {
  readonly name: string;
  readonly logGroup: string;
  readonly logCount: number;
  readonly errorMessage?: string;
  readonly knownUrl?: string;
  readonly knownUrlTarget?: string;
  readonly recentLogs: ReadonlyArray<LogLine>;
}
