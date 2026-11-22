import type { ApiGwExecutionLogRequest } from './ApiGwExecutionLogRequest.js';

export interface ApiGwExecutionLogsOutput {
  readonly mode?: string;
  readonly logGroup?: string;
  readonly requestCount?: number;
  readonly logCount?: number;
  readonly unavailableReason?: string;
  readonly requestIds: ReadonlyArray<ApiGwExecutionLogRequest>;
}
