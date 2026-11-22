import type { LogLine } from '../parsing/aws/cloudwatch-logs/LogLine.js';

/** The recent log lines of a step, with the number of rows they were taken from. */
export interface LogSample {
  readonly id: string;
  readonly label: string;
  readonly sourceStep: string;
  readonly logs: ReadonlyArray<LogLine>;
  readonly totalRows: number;
}
