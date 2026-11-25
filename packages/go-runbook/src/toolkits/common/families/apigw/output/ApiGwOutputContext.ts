import type { ApiGatewayOutput } from './ApiGatewayOutput.js';
import type { ApiGwAlarmOutput } from './ApiGwAlarmOutput.js';
import type { ApiGwAuthorizerOutput } from './ApiGwAuthorizerOutput.js';
import type { ApiGwExecutionLogsOutput } from './ApiGwExecutionLogsOutput.js';
import type { ApiGwServiceOutput } from './ApiGwServiceOutput.js';

export interface ApiGwOutputContext {
  readonly alarm: ApiGwAlarmOutput;
  readonly apiGateway: ApiGatewayOutput;
  readonly authorizer?: ApiGwAuthorizerOutput;
  readonly executionLogs?: ApiGwExecutionLogsOutput;
  readonly services: ReadonlyArray<ApiGwServiceOutput>;
}
