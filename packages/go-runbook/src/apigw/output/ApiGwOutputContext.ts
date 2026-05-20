export interface ApiGwOutputContext {
  readonly alarm: ApiGwAlarmOutput;
  readonly apiGateway: ApiGatewayOutput;
  readonly authorizer?: ApiGwAuthorizerOutput;
  readonly executionLogs?: ApiGwExecutionLogsOutput;
  readonly services: ReadonlyArray<ApiGwServiceOutput>;
}

export interface ApiGwAlarmOutput {
  readonly name?: string;
  readonly datetime?: string;
  readonly datetimeEnd?: string;
  readonly timeRange?: {
    readonly start?: string;
    readonly end?: string;
  };
}

export interface ApiGatewayOutput {
  readonly logGroup: string;
  readonly errorCount?: number;
  readonly statusCode?: string;
  readonly httpMethod?: string;
  readonly path?: string;
  readonly traceId?: string;
  readonly traceIdField?: string;
  readonly fallbackUuid?: string;
  readonly errorMessage?: string;
  readonly recentLogs: ReadonlyArray<ApiGwLogLine>;
}

export interface ApiGwAuthorizerOutput {
  readonly lambdaName?: string;
  readonly timeoutMs?: number;
  readonly status?: string;
  readonly latencyMs?: number;
  readonly requestId?: string;
  readonly outcome?: ApiGwAuthorizerOutcome;
}

export type ApiGwAuthorizerOutcome = 'skipped' | 'no-error' | 'timeout' | 'error';

export interface ApiGwExecutionLogsOutput {
  readonly mode?: string;
  readonly logGroup?: string;
  readonly requestCount?: number;
  readonly logCount?: number;
  readonly requestIds: ReadonlyArray<ApiGwExecutionLogRequest>;
}

export interface ApiGwExecutionLogRequest {
  readonly path?: string;
  readonly requestId: string;
}

export interface ApiGwServiceOutput {
  readonly name: string;
  readonly logGroup: string;
  readonly logCount: number;
  readonly errorMessage?: string;
  readonly knownUrl?: string;
  readonly knownUrlTarget?: string;
  readonly recentLogs: ReadonlyArray<ApiGwLogLine>;
}

export interface ApiGwLogLine {
  readonly timestamp: string;
  readonly message: string;
}
